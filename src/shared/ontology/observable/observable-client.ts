/*
 * Copyright 2025 dylanyunlon <dylanyunlong@gmail.com>. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon Pantheon architecture patterns.
 *
 *     M57: Observable — real-time subscriptions to ontology changes
 *
 *     From ObjectStore.subscribe as the good example. Then, following
 *     that pattern, implement QuerySubscription to let consumers
 *     subscribe to ObjectSet query results (filtered, sorted, paged),
 *     and enabling automatic re-evaluation when matching objects change.
 *     Next, BatchNotifier introduces configurable coalescing, making
 *     the observable layer able to merge rapid writes into single
 *     notifications (coalesceMs window), while QuerySubscription
 *     optimizes re-evaluation by tracking which object types a query
 *     touches and skipping unrelated changes. Subsequently,
 *     LinkSubscription integrates link-aware observation, letting
 *     consumers subscribe to link traversal results (all objects linked
 *     from a source via a given link type), and SubscriptionGroup
 *     enables bulk lifecycle management where disposing the group
 *     disposes all contained subscriptions. Finally, ObservableClient
 *     composes all subsystems into a single entry point with
 *     observeObject/observeQuery/observeLinks/observeAggregate methods,
 *     ensuring the advisor pipeline and renderer can replace mobx
 *     reactions with ontology-native subscriptions, comprehensively
 *     decoupling UI reactivity from ad-hoc state management.
 */

import type {
  ObjectStore,
  OntologyObjectType,
  OntologyLinkType,
  ObjectEntry,
  ObjectStoreChange,
  LinkEntry
} from '../store/object-store'
import type {
  WhereClause,
  OrderByField,
  AggregationClause,
  AggregationResult
} from '../store/object-set'
import { ObjectSet, createObjectSet } from '../store/object-set'

export type SubscriptionStatus = 'active' | 'paused' | 'disposed'

export interface Disposable {
  dispose(): void
}

export interface ObjectObserverPayload<T = unknown> {
  value: T | null
  previousValue: T | null
  version: number
  changeType: 'write' | 'delete'
  timestamp: number
  isOptimistic: boolean
}

export interface QueryObserverPayload<T = unknown> {
  items: T[]
  previousItems: T[]
  totalCount: number
  addedKeys: string[]
  removedKeys: string[]
  updatedKeys: string[]
  timestamp: number
}

export interface LinkObserverPayload<T = unknown> {
  linkedObjects: T[]
  previousLinkedObjects: T[]
  addedLinks: string[]
  removedLinks: string[]
  timestamp: number
}

export interface AggregateObserverPayload {
  results: AggregationResult[]
  previousResults: AggregationResult[]
  timestamp: number
}

export type ObjectObserver<T = unknown> = (payload: ObjectObserverPayload<T>) => void
export type QueryObserver<T = unknown> = (payload: QueryObserverPayload<T>) => void
export type LinkObserver<T = unknown> = (payload: LinkObserverPayload<T>) => void
export type AggregateObserver = (payload: AggregateObserverPayload) => void

export interface ObserveObjectOptions {
  objectType: OntologyObjectType
  primaryKey: string
  includeOptimistic?: boolean
}

export interface ObserveQueryOptions {
  objectType: OntologyObjectType
  where?: WhereClause
  orderBy?: OrderByField[]
  limit?: number
  offset?: number
  coalesceMs?: number
}

export interface ObserveLinkOptions {
  sourceType: OntologyObjectType
  sourceKey: string
  linkType: OntologyLinkType
  coalesceMs?: number
}

export interface ObserveAggregateOptions {
  objectType: OntologyObjectType
  clauses: AggregationClause[]
  where?: WhereClause
  coalesceMs?: number
}

export interface SubscriptionDescriptor {
  id: string
  type: 'object' | 'query' | 'link' | 'aggregate'
  status: SubscriptionStatus
  objectType: OntologyObjectType
  createdAt: number
  lastNotifiedAt: number
  notificationCount: number
  coalesceMs: number
}

export interface ObservableClientStats {
  totalSubscriptions: number
  activeSubscriptions: number
  pausedSubscriptions: number
  totalNotifications: number
  totalCoalescedBatches: number
  subscriptionsByType: Record<string, number>
}

let subscriptionIdCounter = 0

function nextSubscriptionId(): string {
  return `sub_${++subscriptionIdCounter}_${Date.now()}`
}

export class BatchNotifier {
  private _pending: Map<string, { changes: ObjectStoreChange[]; timer: ReturnType<typeof setTimeout> }> = new Map()
  private _defaultCoalesceMs: number
  private _totalBatches: number = 0

  constructor(defaultCoalesceMs: number = 16) {
    this._defaultCoalesceMs = defaultCoalesceMs
  }

  schedule(
    key: string,
    change: ObjectStoreChange,
    coalesceMs: number | undefined,
    flush: (changes: ObjectStoreChange[]) => void
  ): void {
    const ms = coalesceMs ?? this._defaultCoalesceMs
    const existing = this._pending.get(key)

    if (existing) {
      existing.changes.push(change)
      return
    }

    const entry = {
      changes: [change],
      timer: setTimeout(() => {
        const batch = this._pending.get(key)
        this._pending.delete(key)
        if (batch && batch.changes.length > 0) {
          this._totalBatches++
          try { flush(batch.changes) } catch { /* swallow */ }
        }
      }, ms)
    }
    this._pending.set(key, entry)
  }

  flushAll(): void {
    for (const [key, entry] of this._pending) {
      clearTimeout(entry.timer)
      this._pending.delete(key)
    }
  }

  get pendingCount(): number {
    return this._pending.size
  }

  get totalBatches(): number {
    return this._totalBatches
  }

  dispose(): void {
    for (const [, entry] of this._pending) {
      clearTimeout(entry.timer)
    }
    this._pending.clear()
  }
}

abstract class BaseSubscription implements Disposable {
  readonly id: string
  readonly type: 'object' | 'query' | 'link' | 'aggregate'
  readonly objectType: OntologyObjectType
  readonly createdAt: number

  protected _status: SubscriptionStatus = 'active'
  protected _lastNotifiedAt: number = 0
  protected _notificationCount: number = 0
  protected _coalesceMs: number
  protected _unsubscribers: Array<() => void> = []

  constructor(
    type: 'object' | 'query' | 'link' | 'aggregate',
    objectType: OntologyObjectType,
    coalesceMs: number
  ) {
    this.id = nextSubscriptionId()
    this.type = type
    this.objectType = objectType
    this.createdAt = Date.now()
    this._coalesceMs = coalesceMs
  }

  get status(): SubscriptionStatus {
    return this._status
  }

  pause(): void {
    if (this._status === 'active') {
      this._status = 'paused'
    }
  }

  resume(): void {
    if (this._status === 'paused') {
      this._status = 'active'
    }
  }

  dispose(): void {
    this._status = 'disposed'
    for (const unsub of this._unsubscribers) {
      try { unsub() } catch { /* swallow */ }
    }
    this._unsubscribers = []
  }

  getDescriptor(): SubscriptionDescriptor {
    return {
      id: this.id,
      type: this.type,
      status: this._status,
      objectType: this.objectType,
      createdAt: this.createdAt,
      lastNotifiedAt: this._lastNotifiedAt,
      notificationCount: this._notificationCount,
      coalesceMs: this._coalesceMs
    }
  }

  protected _recordNotification(): void {
    this._notificationCount++
    this._lastNotifiedAt = Date.now()
  }
}

export class ObjectSubscription<T = unknown> extends BaseSubscription {
  private _observer: ObjectObserver<T>
  private _previousValue: T | null = null
  private _store: ObjectStore
  private _primaryKey: string
  private _includeOptimistic: boolean

  constructor(
    store: ObjectStore,
    options: ObserveObjectOptions,
    observer: ObjectObserver<T>
  ) {
    super('object', options.objectType, 0)
    this._store = store
    this._primaryKey = options.primaryKey
    this._includeOptimistic = options.includeOptimistic ?? true
    this._observer = observer

    const unsub = store.subscribe<T>(
      options.objectType,
      options.primaryKey,
      (entry, changeType) => {
        if (this._status !== 'active') return
        if (!this._includeOptimistic && entry?.status === 'optimistic') return

        const payload: ObjectObserverPayload<T> = {
          value: entry ? entry.value as T : null,
          previousValue: this._previousValue,
          version: entry?.version ?? 0,
          changeType,
          timestamp: Date.now(),
          isOptimistic: entry?.status === 'optimistic'
        }

        this._previousValue = payload.value
        this._recordNotification()
        try { this._observer(payload) } catch { /* swallow */ }
      }
    )
    this._unsubscribers.push(unsub)
  }

  get currentValue(): T | null {
    return this._store.read<T>(this.objectType, this._primaryKey)
  }
}

export class QuerySubscription<T = unknown> extends BaseSubscription {
  private _observer: QueryObserver<T>
  private _store: ObjectStore
  private _where: WhereClause | undefined
  private _orderBy: OrderByField[]
  private _limit: number | undefined
  private _offset: number | undefined
  private _previousItems: T[] = []
  private _previousKeySet: Set<string> = new Set()
  private _notifier: BatchNotifier

  constructor(
    store: ObjectStore,
    options: ObserveQueryOptions,
    observer: QueryObserver<T>,
    notifier: BatchNotifier
  ) {
    super('query', options.objectType, options.coalesceMs ?? 16)
    this._store = store
    this._observer = observer
    this._where = options.where
    this._orderBy = options.orderBy ?? []
    this._limit = options.limit
    this._offset = options.offset
    this._notifier = notifier

    this._evaluateAndNotify()

    const unsub = store.subscribeType(options.objectType, (_type, changes) => {
      if (this._status !== 'active') return
      for (const change of changes) {
        this._notifier.schedule(
          this.id,
          change,
          this._coalesceMs,
          () => this._evaluateAndNotify()
        )
      }
    })
    this._unsubscribers.push(unsub)
  }

  private _evaluateAndNotify(): void {
    if (this._status !== 'active') return

    let set: ObjectSet<T> = createObjectSet<T>(this._store, this.objectType)
    if (this._where) set = set.where(this._where)
    for (const ob of this._orderBy) {
      set = set.orderBy(ob.field, ob.direction)
    }
    if (this._offset) set = set.offset(this._offset)
    if (this._limit) set = set.limit(this._limit)

    const items = set.fetchAll()
    const currentKeySet = new Set<string>()
    for (const item of items) {
      const key = this._extractKey(item)
      if (key) currentKeySet.add(key)
    }

    const addedKeys: string[] = []
    const removedKeys: string[] = []
    const updatedKeys: string[] = []

    for (const key of currentKeySet) {
      if (!this._previousKeySet.has(key)) {
        addedKeys.push(key)
      } else {
        updatedKeys.push(key)
      }
    }
    for (const key of this._previousKeySet) {
      if (!currentKeySet.has(key)) {
        removedKeys.push(key)
      }
    }

    const payload: QueryObserverPayload<T> = {
      items,
      previousItems: this._previousItems,
      totalCount: items.length,
      addedKeys,
      removedKeys,
      updatedKeys,
      timestamp: Date.now()
    }

    this._previousItems = items
    this._previousKeySet = currentKeySet
    this._recordNotification()
    try { this._observer(payload) } catch { /* swallow */ }
  }

  private _extractKey(item: unknown): string | null {
    if (item === null || item === undefined || typeof item !== 'object') return null
    const record = item as Record<string, unknown>
    if (typeof record['primaryKey'] === 'string') return record['primaryKey']
    if (typeof record['id'] === 'string') return record['id']
    if (typeof record['puuid'] === 'string') return record['puuid']
    if (typeof record['championId'] === 'number') return String(record['championId'])
    return null
  }

  refresh(): void {
    this._evaluateAndNotify()
  }
}

export class LinkSubscription<T = unknown> extends BaseSubscription {
  private _observer: LinkObserver<T>
  private _store: ObjectStore
  private _sourceKey: string
  private _linkType: OntologyLinkType
  private _previousLinkedObjects: T[] = []
  private _previousLinkKeys: Set<string> = new Set()
  private _notifier: BatchNotifier

  constructor(
    store: ObjectStore,
    options: ObserveLinkOptions,
    observer: LinkObserver<T>,
    notifier: BatchNotifier
  ) {
    super('link', options.sourceType, options.coalesceMs ?? 16)
    this._store = store
    this._observer = observer
    this._sourceKey = options.sourceKey
    this._linkType = options.linkType
    this._notifier = notifier

    this._evaluateAndNotify()

    const unsub = store.subscribeLinks((link, changeType) => {
      if (this._status !== 'active') return
      const isRelevant =
        (link.sourceType === options.sourceType &&
         link.sourceKey === options.sourceKey &&
         link.linkType === options.linkType)
      if (!isRelevant) return

      const syntheticChange: ObjectStoreChange = {
        type: changeType,
        objectType: link.targetType,
        primaryKey: link.targetKey,
        linkType: link.linkType,
        targetType: link.targetType,
        targetKey: link.targetKey,
        timestamp: Date.now()
      }
      this._notifier.schedule(
        this.id,
        syntheticChange,
        this._coalesceMs,
        () => this._evaluateAndNotify()
      )
    })
    this._unsubscribers.push(unsub)
  }

  private _evaluateAndNotify(): void {
    if (this._status !== 'active') return

    const linkedObjects = this._store.getLinkedObjects<T>(
      this.objectType,
      this._sourceKey,
      this._linkType
    )

    const currentLinkKeys = new Set<string>()
    for (const obj of linkedObjects) {
      const key = this._extractLinkKey(obj)
      if (key) currentLinkKeys.add(key)
    }

    const addedLinks: string[] = []
    const removedLinks: string[] = []
    for (const key of currentLinkKeys) {
      if (!this._previousLinkKeys.has(key)) addedLinks.push(key)
    }
    for (const key of this._previousLinkKeys) {
      if (!currentLinkKeys.has(key)) removedLinks.push(key)
    }

    const payload: LinkObserverPayload<T> = {
      linkedObjects,
      previousLinkedObjects: this._previousLinkedObjects,
      addedLinks,
      removedLinks,
      timestamp: Date.now()
    }

    this._previousLinkedObjects = linkedObjects
    this._previousLinkKeys = currentLinkKeys
    this._recordNotification()
    try { this._observer(payload) } catch { /* swallow */ }
  }

  private _extractLinkKey(item: unknown): string | null {
    if (item === null || item === undefined || typeof item !== 'object') return null
    const record = item as Record<string, unknown>
    if (typeof record['primaryKey'] === 'string') return record['primaryKey']
    if (typeof record['id'] === 'string') return record['id']
    return null
  }

  refresh(): void {
    this._evaluateAndNotify()
  }
}

export class AggregateSubscription extends BaseSubscription {
  private _observer: AggregateObserver
  private _store: ObjectStore
  private _clauses: AggregationClause[]
  private _where: WhereClause | undefined
  private _previousResults: AggregationResult[] = []
  private _notifier: BatchNotifier

  constructor(
    store: ObjectStore,
    options: ObserveAggregateOptions,
    observer: AggregateObserver,
    notifier: BatchNotifier
  ) {
    super('aggregate', options.objectType, options.coalesceMs ?? 50)
    this._store = store
    this._observer = observer
    this._clauses = options.clauses
    this._where = options.where
    this._notifier = notifier

    this._evaluateAndNotify()

    const unsub = store.subscribeType(options.objectType, (_type, changes) => {
      if (this._status !== 'active') return
      for (const change of changes) {
        this._notifier.schedule(
          this.id,
          change,
          this._coalesceMs,
          () => this._evaluateAndNotify()
        )
      }
    })
    this._unsubscribers.push(unsub)
  }

  private _evaluateAndNotify(): void {
    if (this._status !== 'active') return

    let set = createObjectSet(this._store, this.objectType)
    if (this._where) set = set.where(this._where)
    const results = set.aggregate(this._clauses)

    const payload: AggregateObserverPayload = {
      results,
      previousResults: this._previousResults,
      timestamp: Date.now()
    }

    this._previousResults = results
    this._recordNotification()
    try { this._observer(payload) } catch { /* swallow */ }
  }

  refresh(): void {
    this._evaluateAndNotify()
  }
}

export class SubscriptionGroup implements Disposable {
  readonly id: string
  private _subscriptions: Map<string, BaseSubscription> = new Map()
  private _createdAt: number

  constructor(id?: string) {
    this.id = id ?? `group_${Date.now()}`
    this._createdAt = Date.now()
  }

  add(subscription: BaseSubscription): void {
    this._subscriptions.set(subscription.id, subscription)
  }

  remove(subscriptionId: string): boolean {
    const sub = this._subscriptions.get(subscriptionId)
    if (!sub) return false
    sub.dispose()
    this._subscriptions.delete(subscriptionId)
    return true
  }

  pauseAll(): void {
    for (const [, sub] of this._subscriptions) {
      sub.pause()
    }
  }

  resumeAll(): void {
    for (const [, sub] of this._subscriptions) {
      sub.resume()
    }
  }

  dispose(): void {
    for (const [, sub] of this._subscriptions) {
      sub.dispose()
    }
    this._subscriptions.clear()
  }

  get size(): number {
    return this._subscriptions.size
  }

  get activeCount(): number {
    let count = 0
    for (const [, sub] of this._subscriptions) {
      if (sub.status === 'active') count++
    }
    return count
  }

  getDescriptors(): SubscriptionDescriptor[] {
    const result: SubscriptionDescriptor[] = []
    for (const [, sub] of this._subscriptions) {
      result.push(sub.getDescriptor())
    }
    return result
  }

  get createdAt(): number {
    return this._createdAt
  }
}

export class ObservableClient implements Disposable {
  private _store: ObjectStore
  private _notifier: BatchNotifier
  private _subscriptions: Map<string, BaseSubscription> = new Map()
  private _groups: Map<string, SubscriptionGroup> = new Map()
  private _totalNotifications: number = 0

  constructor(store: ObjectStore, defaultCoalesceMs: number = 16) {
    this._store = store
    this._notifier = new BatchNotifier(defaultCoalesceMs)
  }

  observeObject<T = unknown>(
    options: ObserveObjectOptions,
    observer: ObjectObserver<T>
  ): ObjectSubscription<T> {
    const sub = new ObjectSubscription<T>(this._store, options, (payload) => {
      this._totalNotifications++
      observer(payload)
    })
    this._subscriptions.set(sub.id, sub)
    return sub
  }

  observeQuery<T = unknown>(
    options: ObserveQueryOptions,
    observer: QueryObserver<T>
  ): QuerySubscription<T> {
    const sub = new QuerySubscription<T>(this._store, options, (payload) => {
      this._totalNotifications++
      observer(payload)
    }, this._notifier)
    this._subscriptions.set(sub.id, sub)
    return sub
  }

  observeLinks<T = unknown>(
    options: ObserveLinkOptions,
    observer: LinkObserver<T>
  ): LinkSubscription<T> {
    const sub = new LinkSubscription<T>(this._store, options, (payload) => {
      this._totalNotifications++
      observer(payload)
    }, this._notifier)
    this._subscriptions.set(sub.id, sub)
    return sub
  }

  observeAggregate(
    options: ObserveAggregateOptions,
    observer: AggregateObserver
  ): AggregateSubscription {
    const sub = new AggregateSubscription(this._store, options, (payload) => {
      this._totalNotifications++
      observer(payload)
    }, this._notifier)
    this._subscriptions.set(sub.id, sub)
    return sub
  }

  unsubscribe(subscriptionId: string): boolean {
    const sub = this._subscriptions.get(subscriptionId)
    if (!sub) return false
    sub.dispose()
    this._subscriptions.delete(subscriptionId)
    return true
  }

  createGroup(id?: string): SubscriptionGroup {
    const group = new SubscriptionGroup(id)
    this._groups.set(group.id, group)
    return group
  }

  disposeGroup(groupId: string): boolean {
    const group = this._groups.get(groupId)
    if (!group) return false
    group.dispose()
    this._groups.delete(groupId)
    return true
  }

  getSubscription(subscriptionId: string): BaseSubscription | undefined {
    return this._subscriptions.get(subscriptionId)
  }

  listSubscriptions(): SubscriptionDescriptor[] {
    const result: SubscriptionDescriptor[] = []
    for (const [, sub] of this._subscriptions) {
      result.push(sub.getDescriptor())
    }
    return result
  }

  getStats(): ObservableClientStats {
    let active = 0
    let paused = 0
    const byType: Record<string, number> = {}

    for (const [, sub] of this._subscriptions) {
      if (sub.status === 'active') active++
      if (sub.status === 'paused') paused++
      byType[sub.type] = (byType[sub.type] ?? 0) + 1
    }

    return {
      totalSubscriptions: this._subscriptions.size,
      activeSubscriptions: active,
      pausedSubscriptions: paused,
      totalNotifications: this._totalNotifications,
      totalCoalescedBatches: this._notifier.totalBatches,
      subscriptionsByType: byType
    }
  }

  pauseAll(): void {
    for (const [, sub] of this._subscriptions) {
      sub.pause()
    }
  }

  resumeAll(): void {
    for (const [, sub] of this._subscriptions) {
      sub.resume()
    }
  }

  dispose(): void {
    for (const [, sub] of this._subscriptions) {
      sub.dispose()
    }
    this._subscriptions.clear()

    for (const [, group] of this._groups) {
      group.dispose()
    }
    this._groups.clear()

    this._notifier.dispose()
  }
}

export function createObservableClient(
  store: ObjectStore,
  defaultCoalesceMs?: number
): ObservableClient {
  return new ObservableClient(store, defaultCoalesceMs)
}
