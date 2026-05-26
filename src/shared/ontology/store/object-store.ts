/*
 * Copyright 2025 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon Pantheon architecture patterns.
 *
 *     M54: Object store — typed in-memory ontology store
 *
 *     From PantheonObservableStore.write as the good example. Then,
 *     following that pattern, implement ObjectEntry to let the store
 *     hold typed objects keyed by (objectType, primaryKey), and
 *     enabling type-safe reads without runtime casts. Next,
 *     LinkRegistry introduces directional link storage, making the
 *     store able to traverse relationships between objects (Player
 *     selected Champion, Match contains Participant) in O(1) per
 *     link lookup, while ObjectEntry optimizes staleness detection
 *     with per-entry TTL tracking. Subsequently, ObjectStore
 *     integrates ObjectEntry, LinkRegistry, and a subscription
 *     system (modeled on PantheonObservableStore.subscribe), letting
 *     consumers observe single objects by key, all objects of a type,
 *     or link sets by source, and OptimisticLayer enables speculative
 *     writes that can be committed or rolled back without corrupting
 *     truth state. Finally, ObjectStoreBatch completes the transaction
 *     model, ensuring multiple writes coalesce into a single change
 *     notification, comprehensively upgrading the scattered mobx
 *     state to a unified typed ontology store with link traversal.
 */

export type OntologyObjectType =
  | 'Player'
  | 'Champion'
  | 'Game'
  | 'Match'
  | 'Participant'
  | 'Rune'
  | 'Item'
  | 'GameEvent'
  | 'DraftAction'
  | 'Snapshot'
  | 'TrainingSample'

export type OntologyLinkType =
  | 'selected'
  | 'played'
  | 'contains'
  | 'counters'
  | 'buildsFrom'
  | 'buildsWith'
  | 'equips'
  | 'usesRune'

export interface ObjectKey {
  objectType: OntologyObjectType
  primaryKey: string
}

export interface ObjectEntry<T = unknown> {
  key: ObjectKey
  value: T
  version: number
  createdAt: number
  updatedAt: number
  expiresAt: number | null
  status: 'active' | 'deleted' | 'optimistic'
}

export interface LinkEntry {
  sourceType: OntologyObjectType
  sourceKey: string
  linkType: OntologyLinkType
  targetType: OntologyObjectType
  targetKey: string
  createdAt: number
  metadata: Record<string, unknown>
}

export interface ObjectStoreChange {
  type: 'write' | 'delete' | 'link-add' | 'link-remove'
  objectType: OntologyObjectType
  primaryKey: string
  linkType?: OntologyLinkType
  targetType?: OntologyObjectType
  targetKey?: string
  timestamp: number
}

export interface ObjectStoreConfig {
  defaultTtlMs: number | null
  maxObjectsPerType: number
  gcIntervalMs: number
  enableOptimistic: boolean
  maxBatchSize: number
  notificationCoalesceMs: number
}

export interface ObjectStoreStats {
  totalObjects: number
  totalLinks: number
  objectCountByType: Record<string, number>
  totalWrites: number
  totalReads: number
  totalDeletes: number
  totalSubscriptions: number
  totalNotifications: number
  optimisticLayerCount: number
  pendingBatchOps: number
}

const DEFAULT_CONFIG: ObjectStoreConfig = {
  defaultTtlMs: null,
  maxObjectsPerType: 10000,
  gcIntervalMs: 30000,
  enableOptimistic: true,
  maxBatchSize: 500,
  notificationCoalesceMs: 0
}

function objectKeyToString(key: ObjectKey): string {
  return `${key.objectType}:${key.primaryKey}`
}

function stringToObjectKey(s: string): ObjectKey {
  const colonIdx = s.indexOf(':')
  return {
    objectType: s.substring(0, colonIdx) as OntologyObjectType,
    primaryKey: s.substring(colonIdx + 1)
  }
}

function linkKeyStr(
  sourceType: OntologyObjectType,
  sourceKey: string,
  linkType: OntologyLinkType,
  targetType: OntologyObjectType,
  targetKey: string
): string {
  return `${sourceType}:${sourceKey}|${linkType}|${targetType}:${targetKey}`
}

function forwardIndexKey(
  sourceType: OntologyObjectType,
  sourceKey: string,
  linkType: OntologyLinkType
): string {
  return `fwd:${sourceType}:${sourceKey}:${linkType}`
}

function reverseIndexKey(
  targetType: OntologyObjectType,
  targetKey: string,
  linkType: OntologyLinkType
): string {
  return `rev:${targetType}:${targetKey}:${linkType}`
}

export type ObjectListener<T = unknown> = (
  entry: ObjectEntry<T> | null,
  changeType: 'write' | 'delete'
) => void

export type TypeListener = (
  objectType: OntologyObjectType,
  changes: ObjectStoreChange[]
) => void

export type LinkListener = (
  link: LinkEntry,
  changeType: 'link-add' | 'link-remove'
) => void

export type GlobalChangeListener = (changes: ObjectStoreChange[]) => void

export class LinkRegistry {
  private _links: Map<string, LinkEntry> = new Map()
  private _forwardIndex: Map<string, Set<string>> = new Map()
  private _reverseIndex: Map<string, Set<string>> = new Map()
  private _totalLinks: number = 0

  addLink(link: LinkEntry): boolean {
    const key = linkKeyStr(
      link.sourceType, link.sourceKey,
      link.linkType,
      link.targetType, link.targetKey
    )
    if (this._links.has(key)) return false

    this._links.set(key, link)
    this._totalLinks++

    const fwdKey = forwardIndexKey(link.sourceType, link.sourceKey, link.linkType)
    if (!this._forwardIndex.has(fwdKey)) {
      this._forwardIndex.set(fwdKey, new Set())
    }
    this._forwardIndex.get(fwdKey)!.add(key)

    const revKey = reverseIndexKey(link.targetType, link.targetKey, link.linkType)
    if (!this._reverseIndex.has(revKey)) {
      this._reverseIndex.set(revKey, new Set())
    }
    this._reverseIndex.get(revKey)!.add(key)

    return true
  }

  removeLink(
    sourceType: OntologyObjectType,
    sourceKey: string,
    linkType: OntologyLinkType,
    targetType: OntologyObjectType,
    targetKey: string
  ): LinkEntry | null {
    const key = linkKeyStr(sourceType, sourceKey, linkType, targetType, targetKey)
    const link = this._links.get(key)
    if (!link) return null

    this._links.delete(key)
    this._totalLinks--

    const fwdKey = forwardIndexKey(sourceType, sourceKey, linkType)
    this._forwardIndex.get(fwdKey)?.delete(key)

    const revKey = reverseIndexKey(targetType, targetKey, linkType)
    this._reverseIndex.get(revKey)?.delete(key)

    return link
  }

  getLinksFrom(
    sourceType: OntologyObjectType,
    sourceKey: string,
    linkType: OntologyLinkType
  ): LinkEntry[] {
    const fwdKey = forwardIndexKey(sourceType, sourceKey, linkType)
    const linkKeys = this._forwardIndex.get(fwdKey)
    if (!linkKeys) return []
    const result: LinkEntry[] = []
    for (const k of linkKeys) {
      const entry = this._links.get(k)
      if (entry) result.push(entry)
    }
    return result
  }

  getLinksTo(
    targetType: OntologyObjectType,
    targetKey: string,
    linkType: OntologyLinkType
  ): LinkEntry[] {
    const revKey = reverseIndexKey(targetType, targetKey, linkType)
    const linkKeys = this._reverseIndex.get(revKey)
    if (!linkKeys) return []
    const result: LinkEntry[] = []
    for (const k of linkKeys) {
      const entry = this._links.get(k)
      if (entry) result.push(entry)
    }
    return result
  }

  removeAllLinksFor(objectType: OntologyObjectType, primaryKey: string): number {
    let count = 0
    const toRemove: string[] = []
    for (const [key, link] of this._links) {
      if (
        (link.sourceType === objectType && link.sourceKey === primaryKey) ||
        (link.targetType === objectType && link.targetKey === primaryKey)
      ) {
        toRemove.push(key)
      }
    }
    for (const key of toRemove) {
      const link = this._links.get(key)!
      this.removeLink(
        link.sourceType, link.sourceKey,
        link.linkType,
        link.targetType, link.targetKey
      )
      count++
    }
    return count
  }

  hasLink(
    sourceType: OntologyObjectType,
    sourceKey: string,
    linkType: OntologyLinkType,
    targetType: OntologyObjectType,
    targetKey: string
  ): boolean {
    const key = linkKeyStr(sourceType, sourceKey, linkType, targetType, targetKey)
    return this._links.has(key)
  }

  get totalLinks(): number {
    return this._totalLinks
  }

  clear(): void {
    this._links.clear()
    this._forwardIndex.clear()
    this._reverseIndex.clear()
    this._totalLinks = 0
  }
}

export class OptimisticLayer {
  private _writes: Map<string, ObjectEntry> = new Map()
  private _deletes: Set<string> = new Set()
  readonly layerId: string
  readonly createdAt: number

  constructor(layerId: string) {
    this.layerId = layerId
    this.createdAt = Date.now()
  }

  write<T>(key: ObjectKey, value: T, version: number): void {
    const keyStr = objectKeyToString(key)
    this._deletes.delete(keyStr)
    this._writes.set(keyStr, {
      key,
      value,
      version,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt: null,
      status: 'optimistic'
    })
  }

  markDelete(key: ObjectKey): void {
    const keyStr = objectKeyToString(key)
    this._writes.delete(keyStr)
    this._deletes.add(keyStr)
  }

  getWrite(keyStr: string): ObjectEntry | undefined {
    return this._writes.get(keyStr)
  }

  isDeleted(keyStr: string): boolean {
    return this._deletes.has(keyStr)
  }

  get affectedKeys(): string[] {
    return [
      ...Array.from(this._writes.keys()),
      ...Array.from(this._deletes)
    ]
  }

  get writeCount(): number {
    return this._writes.size
  }

  get deleteCount(): number {
    return this._deletes.size
  }
}

export class ObjectStore {
  private _config: ObjectStoreConfig
  private _objects: Map<string, ObjectEntry> = new Map()
  private _typeIndex: Map<OntologyObjectType, Set<string>> = new Map()
  private _links: LinkRegistry
  private _optimisticLayers: Map<string, OptimisticLayer> = new Map()
  private _objectListeners: Map<string, Set<ObjectListener>> = new Map()
  private _typeListeners: Map<OntologyObjectType, Set<TypeListener>> = new Map()
  private _linkListeners: Set<LinkListener> = new Set()
  private _globalListeners: Set<GlobalChangeListener> = new Set()
  private _versionCounter: number = 0
  private _gcTimer: ReturnType<typeof setInterval> | null = null
  private _isBatching: boolean = false
  private _batchChanges: ObjectStoreChange[] = []
  private _totalWrites: number = 0
  private _totalReads: number = 0
  private _totalDeletes: number = 0
  private _totalNotifications: number = 0

  constructor(config?: Partial<ObjectStoreConfig>) {
    this._config = { ...DEFAULT_CONFIG, ...config }
    this._links = new LinkRegistry()
  }

  write<T>(objectType: OntologyObjectType, primaryKey: string, value: T, ttlMs?: number): ObjectEntry<T> {
    this._totalWrites++
    const key: ObjectKey = { objectType, primaryKey }
    const keyStr = objectKeyToString(key)
    const now = Date.now()
    const version = ++this._versionCounter

    const expiresAt = ttlMs !== undefined
      ? now + ttlMs
      : this._config.defaultTtlMs !== null
        ? now + this._config.defaultTtlMs
        : null

    const existing = this._objects.get(keyStr)
    const entry: ObjectEntry<T> = {
      key,
      value,
      version,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      expiresAt,
      status: 'active'
    }

    this._objects.set(keyStr, entry as ObjectEntry)
    this._ensureTypeIndex(objectType).add(keyStr)
    this._evictIfNeeded(objectType)

    const change: ObjectStoreChange = {
      type: 'write',
      objectType,
      primaryKey,
      timestamp: now
    }

    if (this._isBatching) {
      this._batchChanges.push(change)
    } else {
      this._notifyObjectListeners(keyStr, entry as ObjectEntry, 'write')
      this._notifyTypeListeners(objectType, [change])
      this._notifyGlobalListeners([change])
    }

    return entry
  }

  read<T>(objectType: OntologyObjectType, primaryKey: string): T | null {
    this._totalReads++
    const keyStr = objectKeyToString({ objectType, primaryKey })

    for (const [, layer] of this._optimisticLayers) {
      if (layer.isDeleted(keyStr)) return null
      const optimistic = layer.getWrite(keyStr)
      if (optimistic) return optimistic.value as T
    }

    const entry = this._objects.get(keyStr)
    if (!entry) return null
    if (entry.status === 'deleted') return null
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this._objects.delete(keyStr)
      this._ensureTypeIndex(objectType).delete(keyStr)
      return null
    }
    return entry.value as T
  }

  readEntry(objectType: OntologyObjectType, primaryKey: string): ObjectEntry | null {
    this._totalReads++
    const keyStr = objectKeyToString({ objectType, primaryKey })
    const entry = this._objects.get(keyStr)
    if (!entry || entry.status === 'deleted') return null
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this._objects.delete(keyStr)
      this._ensureTypeIndex(objectType).delete(keyStr)
      return null
    }
    return entry
  }

  has(objectType: OntologyObjectType, primaryKey: string): boolean {
    const keyStr = objectKeyToString({ objectType, primaryKey })
    const entry = this._objects.get(keyStr)
    if (!entry || entry.status === 'deleted') return false
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) return false
    return true
  }

  delete(objectType: OntologyObjectType, primaryKey: string): boolean {
    this._totalDeletes++
    const keyStr = objectKeyToString({ objectType, primaryKey })
    const entry = this._objects.get(keyStr)
    if (!entry) return false

    entry.status = 'deleted'
    entry.updatedAt = Date.now()
    this._objects.delete(keyStr)
    this._ensureTypeIndex(objectType).delete(keyStr)
    this._links.removeAllLinksFor(objectType, primaryKey)

    const change: ObjectStoreChange = {
      type: 'delete',
      objectType,
      primaryKey,
      timestamp: Date.now()
    }

    if (this._isBatching) {
      this._batchChanges.push(change)
    } else {
      this._notifyObjectListeners(keyStr, null, 'delete')
      this._notifyTypeListeners(objectType, [change])
      this._notifyGlobalListeners([change])
    }

    return true
  }

  queryByType<T>(objectType: OntologyObjectType): T[] {
    const typeKeys = this._typeIndex.get(objectType)
    if (!typeKeys) return []
    const now = Date.now()
    const result: T[] = []
    for (const keyStr of typeKeys) {
      const entry = this._objects.get(keyStr)
      if (!entry || entry.status === 'deleted') continue
      if (entry.expiresAt !== null && now > entry.expiresAt) continue
      result.push(entry.value as T)
    }
    return result
  }

  queryEntries(objectType: OntologyObjectType): ObjectEntry[] {
    const typeKeys = this._typeIndex.get(objectType)
    if (!typeKeys) return []
    const now = Date.now()
    const result: ObjectEntry[] = []
    for (const keyStr of typeKeys) {
      const entry = this._objects.get(keyStr)
      if (!entry || entry.status === 'deleted') continue
      if (entry.expiresAt !== null && now > entry.expiresAt) continue
      result.push(entry)
    }
    return result
  }

  countByType(objectType: OntologyObjectType): number {
    const typeKeys = this._typeIndex.get(objectType)
    return typeKeys?.size ?? 0
  }

  addLink(
    sourceType: OntologyObjectType,
    sourceKey: string,
    linkType: OntologyLinkType,
    targetType: OntologyObjectType,
    targetKey: string,
    metadata?: Record<string, unknown>
  ): boolean {
    const link: LinkEntry = {
      sourceType,
      sourceKey,
      linkType,
      targetType,
      targetKey,
      createdAt: Date.now(),
      metadata: metadata ?? {}
    }
    const added = this._links.addLink(link)
    if (!added) return false

    const change: ObjectStoreChange = {
      type: 'link-add',
      objectType: sourceType,
      primaryKey: sourceKey,
      linkType,
      targetType,
      targetKey,
      timestamp: Date.now()
    }

    if (this._isBatching) {
      this._batchChanges.push(change)
    } else {
      this._notifyLinkListeners(link, 'link-add')
      this._notifyGlobalListeners([change])
    }

    return true
  }

  removeLink(
    sourceType: OntologyObjectType,
    sourceKey: string,
    linkType: OntologyLinkType,
    targetType: OntologyObjectType,
    targetKey: string
  ): boolean {
    const removed = this._links.removeLink(sourceType, sourceKey, linkType, targetType, targetKey)
    if (!removed) return false

    const change: ObjectStoreChange = {
      type: 'link-remove',
      objectType: sourceType,
      primaryKey: sourceKey,
      linkType,
      targetType,
      targetKey,
      timestamp: Date.now()
    }

    if (this._isBatching) {
      this._batchChanges.push(change)
    } else {
      this._notifyLinkListeners(removed, 'link-remove')
      this._notifyGlobalListeners([change])
    }

    return true
  }

  getLinkedObjects<T>(
    sourceType: OntologyObjectType,
    sourceKey: string,
    linkType: OntologyLinkType
  ): T[] {
    const links = this._links.getLinksFrom(sourceType, sourceKey, linkType)
    const result: T[] = []
    for (const link of links) {
      const value = this.read<T>(link.targetType, link.targetKey)
      if (value !== null) result.push(value)
    }
    return result
  }

  getLinksFrom(
    sourceType: OntologyObjectType,
    sourceKey: string,
    linkType: OntologyLinkType
  ): LinkEntry[] {
    return this._links.getLinksFrom(sourceType, sourceKey, linkType)
  }

  getLinksTo(
    targetType: OntologyObjectType,
    targetKey: string,
    linkType: OntologyLinkType
  ): LinkEntry[] {
    return this._links.getLinksTo(targetType, targetKey, linkType)
  }

  hasLink(
    sourceType: OntologyObjectType,
    sourceKey: string,
    linkType: OntologyLinkType,
    targetType: OntologyObjectType,
    targetKey: string
  ): boolean {
    return this._links.hasLink(sourceType, sourceKey, linkType, targetType, targetKey)
  }

  writeOptimistic<T>(layerId: string, objectType: OntologyObjectType, primaryKey: string, value: T): void {
    if (!this._config.enableOptimistic) return
    let layer = this._optimisticLayers.get(layerId)
    if (!layer) {
      layer = new OptimisticLayer(layerId)
      this._optimisticLayers.set(layerId, layer)
    }
    const version = ++this._versionCounter
    layer.write({ objectType, primaryKey }, value, version)

    const keyStr = objectKeyToString({ objectType, primaryKey })
    const entry: ObjectEntry<T> = {
      key: { objectType, primaryKey },
      value,
      version,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt: null,
      status: 'optimistic'
    }
    this._notifyObjectListeners(keyStr, entry as ObjectEntry, 'write')
  }

  commitOptimistic(layerId: string): string[] {
    const layer = this._optimisticLayers.get(layerId)
    if (!layer) return []

    const affected = layer.affectedKeys
    for (const keyStr of affected) {
      const optimistic = layer.getWrite(keyStr)
      if (optimistic) {
        const key = optimistic.key
        optimistic.status = 'active'
        this._objects.set(keyStr, optimistic)
        this._ensureTypeIndex(key.objectType).add(keyStr)
      }
    }

    this._optimisticLayers.delete(layerId)
    return affected
  }

  rollbackOptimistic(layerId: string): string[] {
    const layer = this._optimisticLayers.get(layerId)
    if (!layer) return []

    const affected = layer.affectedKeys
    for (const keyStr of affected) {
      const truth = this._objects.get(keyStr)
      if (truth) {
        this._notifyObjectListeners(keyStr, truth, 'write')
      } else {
        this._notifyObjectListeners(keyStr, null, 'delete')
      }
    }

    this._optimisticLayers.delete(layerId)
    return affected
  }

  subscribe<T>(
    objectType: OntologyObjectType,
    primaryKey: string,
    listener: ObjectListener<T>
  ): () => void {
    const keyStr = objectKeyToString({ objectType, primaryKey })
    if (!this._objectListeners.has(keyStr)) {
      this._objectListeners.set(keyStr, new Set())
    }
    this._objectListeners.get(keyStr)!.add(listener as ObjectListener)

    const entry = this._objects.get(keyStr)
    if (entry && entry.status === 'active') {
      try { (listener as ObjectListener)(entry, 'write') } catch { /* swallow */ }
    }

    return () => {
      this._objectListeners.get(keyStr)?.delete(listener as ObjectListener)
    }
  }

  subscribeType(objectType: OntologyObjectType, listener: TypeListener): () => void {
    if (!this._typeListeners.has(objectType)) {
      this._typeListeners.set(objectType, new Set())
    }
    this._typeListeners.get(objectType)!.add(listener)
    return () => {
      this._typeListeners.get(objectType)?.delete(listener)
    }
  }

  subscribeLinks(listener: LinkListener): () => void {
    this._linkListeners.add(listener)
    return () => { this._linkListeners.delete(listener) }
  }

  onChange(listener: GlobalChangeListener): () => void {
    this._globalListeners.add(listener)
    return () => { this._globalListeners.delete(listener) }
  }

  beginBatch(): void {
    this._isBatching = true
    this._batchChanges = []
  }

  commitBatch(): void {
    this._isBatching = false
    const changes = this._batchChanges
    this._batchChanges = []

    if (changes.length === 0) return

    const byType = new Map<OntologyObjectType, ObjectStoreChange[]>()
    for (const change of changes) {
      if (!byType.has(change.objectType)) {
        byType.set(change.objectType, [])
      }
      byType.get(change.objectType)!.push(change)

      if (change.type === 'write' || change.type === 'delete') {
        const keyStr = objectKeyToString({ objectType: change.objectType, primaryKey: change.primaryKey })
        const entry = change.type === 'write' ? this._objects.get(keyStr) ?? null : null
        this._notifyObjectListeners(keyStr, entry, change.type)
      }
    }

    for (const [objectType, typeChanges] of byType) {
      this._notifyTypeListeners(objectType, typeChanges)
    }

    this._notifyGlobalListeners(changes)
  }

  rollbackBatch(): void {
    this._isBatching = false
    this._batchChanges = []
  }

  startGc(): void {
    if (this._gcTimer) return
    this._gcTimer = setInterval(() => this._gc(), this._config.gcIntervalMs)
  }

  stopGc(): void {
    if (this._gcTimer) {
      clearInterval(this._gcTimer)
      this._gcTimer = null
    }
  }

  getStats(): ObjectStoreStats {
    const objectCountByType: Record<string, number> = {}
    for (const [type, keys] of this._typeIndex) {
      objectCountByType[type] = keys.size
    }

    return {
      totalObjects: this._objects.size,
      totalLinks: this._links.totalLinks,
      objectCountByType,
      totalWrites: this._totalWrites,
      totalReads: this._totalReads,
      totalDeletes: this._totalDeletes,
      totalSubscriptions: this._countSubscriptions(),
      totalNotifications: this._totalNotifications,
      optimisticLayerCount: this._optimisticLayers.size,
      pendingBatchOps: this._batchChanges.length
    }
  }

  clear(): void {
    this._objects.clear()
    this._typeIndex.clear()
    this._links.clear()
    this._optimisticLayers.clear()
    this._batchChanges = []
    this._isBatching = false
  }

  dispose(): void {
    this.stopGc()
    this._objectListeners.clear()
    this._typeListeners.clear()
    this._linkListeners.clear()
    this._globalListeners.clear()
    this.clear()
  }

  private _ensureTypeIndex(objectType: OntologyObjectType): Set<string> {
    let set = this._typeIndex.get(objectType)
    if (!set) {
      set = new Set()
      this._typeIndex.set(objectType, set)
    }
    return set
  }

  private _evictIfNeeded(objectType: OntologyObjectType): void {
    const typeKeys = this._typeIndex.get(objectType)
    if (!typeKeys || typeKeys.size <= this._config.maxObjectsPerType) return

    let oldestKey: string | null = null
    let oldestTime = Infinity
    for (const keyStr of typeKeys) {
      const entry = this._objects.get(keyStr)
      if (entry && entry.updatedAt < oldestTime) {
        oldestTime = entry.updatedAt
        oldestKey = keyStr
      }
    }
    if (oldestKey) {
      const key = stringToObjectKey(oldestKey)
      this.delete(key.objectType, key.primaryKey)
    }
  }

  private _gc(): void {
    const now = Date.now()
    const expired: string[] = []
    for (const [keyStr, entry] of this._objects) {
      if (entry.expiresAt !== null && now > entry.expiresAt) {
        expired.push(keyStr)
      }
    }
    for (const keyStr of expired) {
      const key = stringToObjectKey(keyStr)
      this.delete(key.objectType, key.primaryKey)
    }
  }

  private _notifyObjectListeners(keyStr: string, entry: ObjectEntry | null, changeType: 'write' | 'delete'): void {
    const listeners = this._objectListeners.get(keyStr)
    if (!listeners) return
    this._totalNotifications += listeners.size
    for (const listener of listeners) {
      try { listener(entry, changeType) } catch { /* swallow */ }
    }
  }

  private _notifyTypeListeners(objectType: OntologyObjectType, changes: ObjectStoreChange[]): void {
    const listeners = this._typeListeners.get(objectType)
    if (!listeners) return
    this._totalNotifications += listeners.size
    for (const listener of listeners) {
      try { listener(objectType, changes) } catch { /* swallow */ }
    }
  }

  private _notifyLinkListeners(link: LinkEntry, changeType: 'link-add' | 'link-remove'): void {
    this._totalNotifications += this._linkListeners.size
    for (const listener of this._linkListeners) {
      try { listener(link, changeType) } catch { /* swallow */ }
    }
  }

  private _notifyGlobalListeners(changes: ObjectStoreChange[]): void {
    this._totalNotifications += this._globalListeners.size
    for (const listener of this._globalListeners) {
      try { listener(changes) } catch { /* swallow */ }
    }
  }

  private _countSubscriptions(): number {
    let count = 0
    for (const [, listeners] of this._objectListeners) {
      count += listeners.size
    }
    for (const [, listeners] of this._typeListeners) {
      count += listeners.size
    }
    count += this._linkListeners.size
    count += this._globalListeners.size
    return count
  }
}

export function createObjectStore(config?: Partial<ObjectStoreConfig>): ObjectStore {
  return new ObjectStore(config)
}
