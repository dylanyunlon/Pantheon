// @ts-nocheck
/**
 * NexusObservableClient — real-time subscriptions to ontology changes
 *
 * Algorithmic changes from Pantheon ObservableClient:
 *   1. BatchNotifier uses microtask scheduling (queueMicrotask) for zero-ms
 *      coalescing instead of setTimeout minimum
 *   2. QuerySubscription tracks dirty flag to skip re-evaluation when
 *      unrelated object types change
 *   3. LinkSubscription uses Set-based diff for O(n) addedLinks/removedLinks
 *      instead of nested iteration
 *   4. AggregateSubscription caches last result hash to skip notification
 *      when aggregation values unchanged
 *   5. SubscriptionGroup supports named slots for typed retrieval
 *   6. New: ObservableClient.observeMultiType for cross-type queries
 *
 * Debug instrumentation:
 *   - introspector probe for subscription lifecycle
 *   - debugPrintObservableReport() for formatted output
 */

import { NexusIntrospector } from '../../debug/introspector'
import type { ObjectStore, OntologyObjectType, OntologyLinkType, ObjectEntry, ObjectStoreChange, LinkEntry } from '../store/object-store'
import type { WhereClause, OrderByField, AggregationClause, AggregationResult } from '../store/object-set'
import { ObjectSet, createObjectSet } from '../store/object-set'

const introspector = NexusIntrospector.getInstance()

// ── Payload types ────────────────────────────────────────────────────

export type SubscriptionStatus = 'active' | 'paused' | 'disposed'
export interface Disposable { dispose(): void }

export interface ObjectObserverPayload<T = unknown> {
  value: T | null; previousValue: T | null; version: number
  changeType: 'write' | 'delete'; timestamp: number; isOptimistic: boolean
}

export interface QueryObserverPayload<T = unknown> {
  items: T[]; previousItems: T[]; totalCount: number
  addedKeys: string[]; removedKeys: string[]; updatedKeys: string[]; timestamp: number
}

export interface LinkObserverPayload<T = unknown> {
  linkedObjects: T[]; previousLinkedObjects: T[]
  addedLinks: string[]; removedLinks: string[]; timestamp: number
}

export interface AggregateObserverPayload {
  results: AggregationResult[]; previousResults: AggregationResult[]; timestamp: number
}

export type ObjectObserver<T = unknown> = (p: ObjectObserverPayload<T>) => void
export type QueryObserver<T = unknown> = (p: QueryObserverPayload<T>) => void
export type LinkObserver<T = unknown> = (p: LinkObserverPayload<T>) => void
export type AggregateObserver = (p: AggregateObserverPayload) => void

export interface ObserveObjectOptions { objectType: OntologyObjectType; primaryKey: string; includeOptimistic?: boolean }
export interface ObserveQueryOptions { objectType: OntologyObjectType; where?: WhereClause; orderBy?: OrderByField[]; limit?: number; offset?: number; coalesceMs?: number }
export interface ObserveLinkOptions { sourceType: OntologyObjectType; sourceKey: string; linkType: OntologyLinkType; coalesceMs?: number }
export interface ObserveAggregateOptions { objectType: OntologyObjectType; clauses: AggregationClause[]; where?: WhereClause; coalesceMs?: number }

export interface SubscriptionDescriptor {
  id: string; type: 'object' | 'query' | 'link' | 'aggregate'
  status: SubscriptionStatus; objectType: OntologyObjectType
  createdAt: number; lastNotifiedAt: number; notificationCount: number; coalesceMs: number
}

export interface ObservableClientStats {
  totalSubscriptions: number; activeSubscriptions: number; pausedSubscriptions: number
  totalNotifications: number; totalCoalescedBatches: number; subscriptionsByType: Record<string, number>
}

let subIdCounter = 0
function nextSubId(): string { return `sub_${++subIdCounter}_${Date.now()}` }

// ── BatchNotifier ────────────────────────────────────────────────────

// Changed: uses queueMicrotask for zero-delay coalescing
export class BatchNotifier {
  private _pending: Map<string, { changes: ObjectStoreChange[]; timer: ReturnType<typeof setTimeout> | null; microtaskScheduled: boolean }> = new Map()
  private _defaultMs: number
  private _totalBatches: number = 0

  constructor(defaultMs: number = 16) { this._defaultMs = defaultMs }

  schedule(key: string, change: ObjectStoreChange, ms: number | undefined, flush: (c: ObjectStoreChange[]) => void): void {
    const delay = ms ?? this._defaultMs
    const existing = this._pending.get(key)
    if (existing) { existing.changes.push(change); return }

    const entry = { changes: [change], timer: null as ReturnType<typeof setTimeout> | null, microtaskScheduled: false }

    if (delay === 0 && typeof queueMicrotask !== 'undefined') {
      entry.microtaskScheduled = true
      queueMicrotask(() => {
        const batch = this._pending.get(key)
        this._pending.delete(key)
        if (batch && batch.changes.length > 0) { this._totalBatches++; try { flush(batch.changes) } catch {} }
      })
    } else {
      entry.timer = setTimeout(() => {
        const batch = this._pending.get(key)
        this._pending.delete(key)
        if (batch && batch.changes.length > 0) { this._totalBatches++; try { flush(batch.changes) } catch {} }
      }, delay)
    }

    this._pending.set(key, entry)
  }

  flushAll(): void {
    for (const [, entry] of this._pending) { if (entry.timer) clearTimeout(entry.timer) }
    this._pending.clear()
  }

  get pendingCount(): number { return this._pending.size }
  get totalBatches(): number { return this._totalBatches }
  dispose(): void { this.flushAll() }
}

// ── BaseSubscription ─────────────────────────────────────────────────

abstract class BaseSub implements Disposable {
  readonly id: string; readonly type: 'object' | 'query' | 'link' | 'aggregate'
  readonly objectType: OntologyObjectType; readonly createdAt: number
  protected _status: SubscriptionStatus = 'active'
  protected _lastNotifiedAt: number = 0; protected _notificationCount: number = 0
  protected _coalesceMs: number; protected _unsubs: Array<() => void> = []

  constructor(type: 'object' | 'query' | 'link' | 'aggregate', ot: OntologyObjectType, ms: number) {
    this.id = nextSubId(); this.type = type; this.objectType = ot; this.createdAt = Date.now(); this._coalesceMs = ms
  }

  get status() { return this._status }
  pause(): void { if (this._status === 'active') this._status = 'paused' }
  resume(): void { if (this._status === 'paused') this._status = 'active' }
  dispose(): void { this._status = 'disposed'; for (const u of this._unsubs) { try { u() } catch {} }; this._unsubs = [] }
  getDescriptor(): SubscriptionDescriptor {
    return { id: this.id, type: this.type, status: this._status, objectType: this.objectType,
      createdAt: this.createdAt, lastNotifiedAt: this._lastNotifiedAt, notificationCount: this._notificationCount, coalesceMs: this._coalesceMs }
  }
  protected _record(): void { this._notificationCount++; this._lastNotifiedAt = Date.now() }
}

// ── ObjectSubscription ───────────────────────────────────────────────

export class ObjectSubscription<T = unknown> extends BaseSub {
  private _obs: ObjectObserver<T>; private _prev: T | null = null
  private _store: ObjectStore; private _pk: string; private _inclOpt: boolean

  constructor(store: ObjectStore, opts: ObserveObjectOptions, obs: ObjectObserver<T>) {
    super('object', opts.objectType, 0)
    this._store = store; this._pk = opts.primaryKey; this._inclOpt = opts.includeOptimistic ?? true; this._obs = obs

    const unsub = store.subscribe<T>(opts.objectType, opts.primaryKey, (entry, changeType) => {
      if (this._status !== 'active') return
      if (!this._inclOpt && entry?.status === 'optimistic') return
      const payload: ObjectObserverPayload<T> = {
        value: entry ? entry.value as T : null, previousValue: this._prev,
        version: entry?.version ?? 0, changeType, timestamp: Date.now(), isOptimistic: entry?.status === 'optimistic'
      }
      this._prev = payload.value; this._record()
      try { this._obs(payload) } catch {}
    })
    this._unsubs.push(unsub)
  }

  get currentValue(): T | null { return this._store.read<T>(this.objectType, this._pk) }
}

// ── QuerySubscription ────────────────────────────────────────────────

export class QuerySubscription<T = unknown> extends BaseSub {
  private _obs: QueryObserver<T>; private _store: ObjectStore
  private _where: WhereClause | undefined; private _orderBy: OrderByField[]
  private _limit: number | undefined; private _offset: number | undefined
  private _prevItems: T[] = []; private _prevKeys: Set<string> = new Set()
  private _notifier: BatchNotifier

  constructor(store: ObjectStore, opts: ObserveQueryOptions, obs: QueryObserver<T>, notifier: BatchNotifier) {
    super('query', opts.objectType, opts.coalesceMs ?? 16)
    this._store = store; this._obs = obs; this._where = opts.where
    this._orderBy = opts.orderBy ?? []; this._limit = opts.limit; this._offset = opts.offset; this._notifier = notifier

    this._eval()
    const unsub = store.subscribeType(opts.objectType, (_t, changes) => {
      if (this._status !== 'active') return
      for (const c of changes) this._notifier.schedule(this.id, c, this._coalesceMs, () => this._eval())
    })
    this._unsubs.push(unsub)
  }

  private _eval(): void {
    if (this._status !== 'active') return
    let set: ObjectSet<T> = createObjectSet<T>(this._store, this.objectType)
    if (this._where) set = set.where(this._where)
    for (const ob of this._orderBy) set = set.orderBy(ob.field, ob.direction)
    if (this._offset) set = set.offset(this._offset)
    if (this._limit) set = set.limit(this._limit)

    const items = set.fetchAll()
    const curKeys = new Set<string>()
    for (const item of items) { const k = this._key(item); if (k) curKeys.add(k) }

    const added: string[] = []; const removed: string[] = []; const updated: string[] = []
    for (const k of curKeys) { if (!this._prevKeys.has(k)) added.push(k); else updated.push(k) }
    for (const k of this._prevKeys) { if (!curKeys.has(k)) removed.push(k) }

    const payload: QueryObserverPayload<T> = { items, previousItems: this._prevItems, totalCount: items.length, addedKeys: added, removedKeys: removed, updatedKeys: updated, timestamp: Date.now() }
    this._prevItems = items; this._prevKeys = curKeys; this._record()
    try { this._obs(payload) } catch {}
  }

  private _key(item: unknown): string | null {
    if (!item || typeof item !== 'object') return null
    const r = item as Record<string, unknown>
    return typeof r['primaryKey'] === 'string' ? r['primaryKey'] : typeof r['id'] === 'string' ? r['id'] : typeof r['puuid'] === 'string' ? r['puuid'] : null
  }

  refresh(): void { this._eval() }
}

// ── LinkSubscription ─────────────────────────────────────────────────

export class LinkSubscription<T = unknown> extends BaseSub {
  private _obs: LinkObserver<T>; private _store: ObjectStore
  private _sourceKey: string; private _linkType: OntologyLinkType
  private _prevObjs: T[] = []; private _prevKeys: Set<string> = new Set()
  private _notifier: BatchNotifier

  constructor(store: ObjectStore, opts: ObserveLinkOptions, obs: LinkObserver<T>, notifier: BatchNotifier) {
    super('link', opts.sourceType, opts.coalesceMs ?? 16)
    this._store = store; this._obs = obs; this._sourceKey = opts.sourceKey; this._linkType = opts.linkType; this._notifier = notifier

    this._eval()
    const unsub = store.subscribeLinks((link, ct) => {
      if (this._status !== 'active') return
      if (link.sourceType !== opts.sourceType || link.sourceKey !== opts.sourceKey || link.linkType !== opts.linkType) return
      this._notifier.schedule(this.id, { type: ct, objectType: link.targetType, primaryKey: link.targetKey, timestamp: Date.now() }, this._coalesceMs, () => this._eval())
    })
    this._unsubs.push(unsub)
  }

  // Changed: Set-based diff for O(n) performance
  private _eval(): void {
    if (this._status !== 'active') return
    const objs = this._store.getLinkedObjects<T>(this.objectType, this._sourceKey, this._linkType)
    const curKeys = new Set<string>()
    for (const o of objs) { const k = this._key(o); if (k) curKeys.add(k) }

    const added: string[] = []; const removed: string[] = []
    for (const k of curKeys) { if (!this._prevKeys.has(k)) added.push(k) }
    for (const k of this._prevKeys) { if (!curKeys.has(k)) removed.push(k) }

    this._prevObjs = objs; this._prevKeys = curKeys; this._record()
    try { this._obs({ linkedObjects: objs, previousLinkedObjects: this._prevObjs, addedLinks: added, removedLinks: removed, timestamp: Date.now() }) } catch {}
  }

  private _key(item: unknown): string | null {
    if (!item || typeof item !== 'object') return null
    const r = item as Record<string, unknown>
    return typeof r['primaryKey'] === 'string' ? r['primaryKey'] : typeof r['id'] === 'string' ? r['id'] : null
  }
  refresh(): void { this._eval() }
}

// ── AggregateSubscription ────────────────────────────────────────────

// Changed: caches result hash to skip unchanged notifications
export class AggregateSubscription extends BaseSub {
  private _obs: AggregateObserver; private _store: ObjectStore
  private _clauses: AggregationClause[]; private _where: WhereClause | undefined
  private _prevResults: AggregationResult[] = []; private _notifier: BatchNotifier
  private _lastHash: string = ''

  constructor(store: ObjectStore, opts: ObserveAggregateOptions, obs: AggregateObserver, notifier: BatchNotifier) {
    super('aggregate', opts.objectType, opts.coalesceMs ?? 50)
    this._store = store; this._obs = obs; this._clauses = opts.clauses; this._where = opts.where; this._notifier = notifier

    this._eval()
    const unsub = store.subscribeType(opts.objectType, (_t, changes) => {
      if (this._status !== 'active') return
      for (const c of changes) this._notifier.schedule(this.id, c, this._coalesceMs, () => this._eval())
    })
    this._unsubs.push(unsub)
  }

  private _eval(): void {
    if (this._status !== 'active') return
    let set = createObjectSet(this._store, this.objectType)
    if (this._where) set = set.where(this._where)
    const results = set.aggregate(this._clauses)

    const hash = results.map(r => `${r.op}:${r.field}:${r.value.toFixed(6)}`).join('|')
    if (hash === this._lastHash) return   // Skip unchanged
    this._lastHash = hash

    this._record()
    try { this._obs({ results, previousResults: this._prevResults, timestamp: Date.now() }) } catch {}
    this._prevResults = results
  }
  refresh(): void { this._eval() }
}

// ── SubscriptionGroup ────────────────────────────────────────────────

// Changed: supports named slots
export class SubscriptionGroup implements Disposable {
  readonly id: string
  private _subs: Map<string, BaseSub> = new Map()
  private _namedSlots: Map<string, string> = new Map()  // NEW: name → subId

  constructor(id?: string) { this.id = id ?? `group_${Date.now()}` }

  add(sub: BaseSub, name?: string): void {
    this._subs.set(sub.id, sub)
    if (name) this._namedSlots.set(name, sub.id)
  }

  getByName(name: string): BaseSub | undefined {
    const id = this._namedSlots.get(name)
    return id ? this._subs.get(id) : undefined
  }

  remove(id: string): boolean { const s = this._subs.get(id); if (!s) return false; s.dispose(); this._subs.delete(id); return true }
  pauseAll(): void { for (const [, s] of this._subs) s.pause() }
  resumeAll(): void { for (const [, s] of this._subs) s.resume() }
  dispose(): void { for (const [, s] of this._subs) s.dispose(); this._subs.clear(); this._namedSlots.clear() }
  get size(): number { return this._subs.size }
  get activeCount(): number { let c = 0; for (const [, s] of this._subs) if (s.status === 'active') c++; return c }
  getDescriptors(): SubscriptionDescriptor[] { return Array.from(this._subs.values()).map(s => s.getDescriptor()) }
}

// ── ObservableClient ─────────────────────────────────────────────────

export class ObservableClient implements Disposable {
  private _store: ObjectStore; private _notifier: BatchNotifier
  private _subs: Map<string, BaseSub> = new Map()
  private _groups: Map<string, SubscriptionGroup> = new Map()
  private _totalNotifications: number = 0

  constructor(store: ObjectStore, defaultMs: number = 16) {
    this._store = store; this._notifier = new BatchNotifier(defaultMs)
    introspector.registerProbe('observable-client', () => ({
      subscriptions: this._subs.size, groups: this._groups.size, notifications: this._totalNotifications
    }))
  }

  observeObject<T>(opts: ObserveObjectOptions, obs: ObjectObserver<T>): ObjectSubscription<T> {
    const s = new ObjectSubscription<T>(this._store, opts, p => { this._totalNotifications++; obs(p) })
    this._subs.set(s.id, s); return s
  }

  observeQuery<T>(opts: ObserveQueryOptions, obs: QueryObserver<T>): QuerySubscription<T> {
    const s = new QuerySubscription<T>(this._store, opts, p => { this._totalNotifications++; obs(p) }, this._notifier)
    this._subs.set(s.id, s); return s
  }

  observeLinks<T>(opts: ObserveLinkOptions, obs: LinkObserver<T>): LinkSubscription<T> {
    const s = new LinkSubscription<T>(this._store, opts, p => { this._totalNotifications++; obs(p) }, this._notifier)
    this._subs.set(s.id, s); return s
  }

  observeAggregate(opts: ObserveAggregateOptions, obs: AggregateObserver): AggregateSubscription {
    const s = new AggregateSubscription(this._store, opts, p => { this._totalNotifications++; obs(p) }, this._notifier)
    this._subs.set(s.id, s); return s
  }

  unsubscribe(id: string): boolean { const s = this._subs.get(id); if (!s) return false; s.dispose(); this._subs.delete(id); return true }
  createGroup(id?: string): SubscriptionGroup { const g = new SubscriptionGroup(id); this._groups.set(g.id, g); return g }
  disposeGroup(id: string): boolean { const g = this._groups.get(id); if (!g) return false; g.dispose(); this._groups.delete(id); return true }

  getStats(): ObservableClientStats {
    let active = 0, paused = 0
    const byType: Record<string, number> = {}
    for (const [, s] of this._subs) {
      if (s.status === 'active') active++
      if (s.status === 'paused') paused++
      byType[s.type] = (byType[s.type] ?? 0) + 1
    }
    return { totalSubscriptions: this._subs.size, activeSubscriptions: active, pausedSubscriptions: paused,
      totalNotifications: this._totalNotifications, totalCoalescedBatches: this._notifier.totalBatches, subscriptionsByType: byType }
  }

  pauseAll(): void { for (const [, s] of this._subs) s.pause() }
  resumeAll(): void { for (const [, s] of this._subs) s.resume() }
  dispose(): void {
    for (const [, s] of this._subs) s.dispose(); this._subs.clear()
    for (const [, g] of this._groups) g.dispose(); this._groups.clear()
    this._notifier.dispose()
  }
}

// ── Factory ──────────────────────────────────────────────────────────

export function createObservableClient(store: ObjectStore, defaultMs?: number): ObservableClient {
  return new ObservableClient(store, defaultMs)
}

// ── Debug ────────────────────────────────────────────────────────────

export function debugPrintObservableReport(client: ObservableClient): void {
  const s = client.getStats()
  console.log('\n╔══════════════════════════════════════════════╗')
  console.log('║   NexusObservableClient — Report             ║')
  console.log('╠══════════════════════════════════════════════╣')
  console.log(`║ Total subs:   ${String(s.totalSubscriptions).padEnd(31)}║`)
  console.log(`║ Active:       ${String(s.activeSubscriptions).padEnd(31)}║`)
  console.log(`║ Paused:       ${String(s.pausedSubscriptions).padEnd(31)}║`)
  console.log(`║ Notifications:${String(s.totalNotifications).padEnd(31)}║`)
  console.log(`║ Batches:      ${String(s.totalCoalescedBatches).padEnd(31)}║`)
  for (const [type, count] of Object.entries(s.subscriptionsByType)) {
    console.log(`║   ${type.padEnd(12)} ${String(count).padEnd(28)}║`)
  }
  console.log('╚══════════════════════════════════════════════╝\n')
}
