import type { PantheonAdvice, PantheonAdviceType, PantheonAdvicePriority } from '../engine'
import type { GamePhase } from '../scheduler'
import type { CacheEntry } from '../cache/layer'
import type { PantheonChanges } from '../cache/query'
import { createPantheonChanges, PantheonDataTracker } from '../cache/query'
import { PantheonCacheLayers } from '../cache/layer'
import { PantheonRefCounts } from '../cache/ref-counts'

export type ObservableStatus = 'idle' | 'loading' | 'loaded' | 'error' | 'stale'

export interface PantheonSubject<T = unknown> {
  key: string
  status: ObservableStatus
  value: T | null
  lastUpdated: number
  refCount: number
  listeners: Set<SubjectListener<T>>
}

export type SubjectListener<T> = (value: T | null, status: ObservableStatus) => void

export interface PantheonQueryOptions {
  dedupeIntervalMs: number
  staleAfterMs: number
  retryOnError: boolean
  maxRetries: number
}

const DEFAULT_QUERY_OPTIONS: PantheonQueryOptions = {
  dedupeIntervalMs: 2000,
  staleAfterMs: 30000,
  retryOnError: true,
  maxRetries: 2
}

export interface BatchWriteOperation<T> {
  key: string
  value: T
  status: ObservableStatus
}

export class PantheonObservableStore {
  private _subjects = new Map<string, PantheonSubject>()
  private _layers: PantheonCacheLayers<unknown>
  private _refCounts: PantheonRefCounts<string>
  private _changeListeners = new Set<(changes: PantheonChanges) => void>()
  private _batchQueue: BatchWriteOperation<unknown>[] = []
  private _isBatching = false
  private _staleCheckTimer: ReturnType<typeof setInterval> | null = null
  private _staleAfterMs: number
  private _totalWrites = 0
  private _totalReads = 0
  private _totalNotifications = 0

  constructor(options?: { staleAfterMs?: number; gcKeepAlive?: number }) {
    this._staleAfterMs = options?.staleAfterMs ?? 30000
    this._layers = new PantheonCacheLayers<unknown>()
    this._refCounts = new PantheonRefCounts<string>(
      options?.gcKeepAlive ?? 60000,
      (key) => {
        this._subjects.delete(key)
        this._layers.truth.delete(key)
      }
    )
    this._refCounts.startAutoGc(10000)
  }

  read<T>(key: string): PantheonSubject<T> | undefined {
    this._totalReads++
    return this._subjects.get(key) as PantheonSubject<T> | undefined
  }

  write<T>(key: string, value: T, status: ObservableStatus = 'loaded'): void {
    if (this._isBatching) {
      this._batchQueue.push({ key, value, status })
      return
    }
    this._doWrite(key, value, status)
  }

  private _doWrite<T>(key: string, value: T, status: ObservableStatus): void {
    this._totalWrites++
    let subject = this._subjects.get(key) as PantheonSubject<T> | undefined
    const isNew = !subject

    if (!subject) {
      subject = {
        key,
        status,
        value,
        lastUpdated: Date.now(),
        refCount: 0,
        listeners: new Set()
      }
      this._subjects.set(key, subject as PantheonSubject)
    } else {
      subject.value = value
      subject.status = status
      subject.lastUpdated = Date.now()
    }

    this._layers.writeTruth(key, value)

    const changes = createPantheonChanges()
    if (isNew) {
      changes.added.add(key)
    } else {
      changes.updated.add(key)
    }

    this._notifySubjectListeners(subject as any)
    if (!changes.isEmpty()) {
      this._notifyChangeListeners(changes)
    }
  }

  delete(key: string): boolean {
    const subject = this._subjects.get(key)
    if (!subject) return false

    const changes = createPantheonChanges()
    changes.removed.add(key)

    subject.status = 'idle'
    subject.value = null
    this._notifySubjectListeners(subject)
    this._notifyChangeListeners(changes)

    this._subjects.delete(key)
    this._layers.truth.delete(key)
    return true
  }

  subscribe<T>(key: string, listener: SubjectListener<T>): () => void {
    let subject = this._subjects.get(key) as PantheonSubject<T> | undefined
    if (!subject) {
      subject = {
        key,
        status: 'idle',
        value: null,
        lastUpdated: 0,
        refCount: 0,
        listeners: new Set()
      }
      this._subjects.set(key, subject as PantheonSubject)
    }

    subject.refCount++
    subject.listeners.add(listener as SubjectListener<unknown>)
    this._refCounts.register(key)
    this._refCounts.retain(key)

    if (subject.value !== null) {
      try { listener(subject.value, subject.status) } catch (_) {}
    }

    return () => {
      subject!.listeners.delete(listener as SubjectListener<unknown>)
      subject!.refCount--
      this._refCounts.release(key)
    }
  }

  onChanges(listener: (changes: PantheonChanges) => void): () => void {
    this._changeListeners.add(listener)
    return () => { this._changeListeners.delete(listener) }
  }

  beginBatch(): void {
    this._isBatching = true
    this._batchQueue = []
  }

  commitBatch(): void {
    this._isBatching = false
    const ops = this._batchQueue
    this._batchQueue = []

    const changes = createPantheonChanges()
    for (const op of ops) {
      const isNew = !this._subjects.has(op.key)
      this._doWrite(op.key, op.value, op.status)
      if (isNew) changes.added.add(op.key)
      else changes.updated.add(op.key)
    }

    if (!changes.isEmpty()) {
      this._notifyChangeListeners(changes)
    }
  }

  rollbackBatch(): void {
    this._isBatching = false
    this._batchQueue = []
  }

  writeOptimistic<T>(layerId: string, key: string, value: T): void {
    this._layers.pushOptimistic(layerId)
    this._layers.writeOptimistic(key, value)

    const subject = this._subjects.get(key)
    if (subject) {
      subject.value = value
      subject.lastUpdated = Date.now()
      this._notifySubjectListeners(subject)
    }
  }

  removeOptimistic(layerId: string): string[] {
    const affected = this._layers.removeOptimistic(layerId)
    for (const key of affected) {
      const truthEntry = this._layers.readTruth(key)
      const subject = this._subjects.get(key)
      if (subject && truthEntry) {
        subject.value = truthEntry.value
        subject.lastUpdated = truthEntry.lastUpdated
        this._notifySubjectListeners(subject)
      }
    }
    return affected
  }

  startStaleCheck(intervalMs: number = 15000): void {
    if (this._staleCheckTimer) return
    this._staleCheckTimer = setInterval(() => {
      const now = Date.now()
      for (const [, subject] of this._subjects) {
        if (
          subject.status === 'loaded' &&
          subject.lastUpdated > 0 &&
          now - subject.lastUpdated > this._staleAfterMs
        ) {
          subject.status = 'stale'
          this._notifySubjectListeners(subject)
        }
      }
    }, intervalMs)
  }

  stopStaleCheck(): void {
    if (this._staleCheckTimer) {
      clearInterval(this._staleCheckTimer)
      this._staleCheckTimer = null
    }
  }

  get stats(): {
    subjectCount: number
    activeRefs: number
    pendingGc: number
    totalWrites: number
    totalReads: number
    totalNotifications: number
  } {
    return {
      subjectCount: this._subjects.size,
      activeRefs: this._refCounts.activeCount,
      pendingGc: this._refCounts.pendingGcCount,
      totalWrites: this._totalWrites,
      totalReads: this._totalReads,
      totalNotifications: this._totalNotifications
    }
  }

  keys(): string[] {
    return Array.from(this._subjects.keys())
  }

  has(key: string): boolean {
    return this._subjects.has(key)
  }

  clear(): void {
    for (const [, subject] of this._subjects) {
      subject.listeners.clear()
    }
    this._subjects.clear()
    this._layers.clearAll()
    this._refCounts.clear()
    this._changeListeners.clear()
    this._batchQueue = []
    this._isBatching = false
  }

  dispose(): void {
    this.stopStaleCheck()
    this._refCounts.stopAutoGc()
    this.clear()
  }

  private _notifySubjectListeners(subject: PantheonSubject): void {
    for (const listener of subject.listeners) {
      this._totalNotifications++
      try { listener(subject.value, subject.status) } catch (_) {}
    }
  }

  private _notifyChangeListeners(changes: PantheonChanges): void {
    for (const listener of this._changeListeners) {
      try { listener(changes) } catch (_) {}
    }
  }
}

export function createObservableStore(
  options?: { staleAfterMs?: number; gcKeepAlive?: number }
): PantheonObservableStore {
  return new PantheonObservableStore(options)
}
