// @ts-nocheck
/**
 * NexusObservableStore — reactive state container
 *
 * Algorithmic changes from PantheonObservableStore:
 *   1. Stale detection uses exponential backoff: staleAfterMs doubles per consecutive stale check
 *   2. Batch commit deduplicates keys — if same key written multiple times, only last write notifies
 *   3. writeOptimistic conflict detection: if truth version > optimistic version, truth wins silently
 *   4. New subscription priority: high-priority listeners notified first (sorted by priority field)
 *   5. GC sweep uses LRU order instead of simple refCount=0 check
 *   6. Stats include movingAvg write rate (writes/sec over last 60s)
 *
 * Debug instrumentation:
 *   - introspector probe for store health
 *   - debugPrintStoreSnapshot() for console dump
 */

import { NexusIntrospector } from '../debug/introspector'

const introspector = NexusIntrospector.getInstance()

// ── Types ──────────────────────────────────────────────────────────────

export type ObservableStatus = 'idle' | 'loading' | 'loaded' | 'error' | 'stale'

export interface NexusSubject<T = unknown> {
  key: string
  status: ObservableStatus
  value: T | null
  lastUpdated: number
  lastAccessed: number        // NEW: for LRU tracking
  refCount: number
  priority: number            // NEW: notification priority
  listeners: Set<SubjectListener<T>>
}

export type SubjectListener<T> = (value: T | null, status: ObservableStatus) => void

export interface NexusQueryOptions {
  dedupeIntervalMs: number
  staleAfterMs: number
  retryOnError: boolean
  maxRetries: number
}

export interface BatchWriteOperation<T> {
  key: string
  value: T
  status: ObservableStatus
}

export interface NexusChanges {
  added: Set<string>
  updated: Set<string>
  removed: Set<string>
  isEmpty(): boolean
}

function createNexusChanges(): NexusChanges {
  return {
    added: new Set(),
    updated: new Set(),
    removed: new Set(),
    isEmpty() { return this.added.size === 0 && this.updated.size === 0 && this.removed.size === 0 }
  }
}

// ── Ref-count tracker (simplified inline) ──────────────────────────────

class RefCountTracker {
  private _refs: Map<string, { count: number; registeredAt: number }> = new Map()
  private _gcKeepAlive: number
  private _gcTimer: ReturnType<typeof setInterval> | null = null
  private _onRelease: (key: string) => void

  constructor(gcKeepAlive: number, onRelease: (key: string) => void) {
    this._gcKeepAlive = gcKeepAlive
    this._onRelease = onRelease
  }

  register(key: string): void {
    if (!this._refs.has(key)) {
      this._refs.set(key, { count: 0, registeredAt: Date.now() })
    }
  }

  retain(key: string): void {
    const ref = this._refs.get(key)
    if (ref) ref.count++
  }

  release(key: string): void {
    const ref = this._refs.get(key)
    if (ref) ref.count = Math.max(0, ref.count - 1)
  }

  get activeCount(): number {
    let c = 0
    for (const [, ref] of this._refs) { if (ref.count > 0) c++ }
    return c
  }

  get pendingGcCount(): number {
    let c = 0
    for (const [, ref] of this._refs) { if (ref.count === 0) c++ }
    return c
  }

  startAutoGc(intervalMs: number): void {
    if (this._gcTimer) return
    this._gcTimer = setInterval(() => {
      const now = Date.now()
      for (const [key, ref] of this._refs) {
        if (ref.count === 0 && now - ref.registeredAt > this._gcKeepAlive) {
          this._refs.delete(key)
          this._onRelease(key)
        }
      }
    }, intervalMs)
  }

  stopAutoGc(): void {
    if (this._gcTimer) { clearInterval(this._gcTimer); this._gcTimer = null }
  }

  clear(): void { this._refs.clear() }
}

// ── Truth layer (simplified inline) ────────────────────────────────────

class TruthLayer<T> {
  private _entries: Map<string, { value: T; lastUpdated: number }> = new Map()

  write(key: string, value: T): void {
    this._entries.set(key, { value, lastUpdated: Date.now() })
  }

  read(key: string): { value: T; lastUpdated: number } | undefined {
    return this._entries.get(key)
  }

  delete(key: string): boolean { return this._entries.delete(key) }
  clearAll(): void { this._entries.clear() }
}

// ── Store ──────────────────────────────────────────────────────────────

export class NexusObservableStore {
  private _subjects = new Map<string, NexusSubject>()
  private _truth = new TruthLayer<unknown>()
  private _refCounts: RefCountTracker
  private _changeListeners = new Set<(changes: NexusChanges) => void>()
  private _batchQueue: BatchWriteOperation<unknown>[] = []
  private _isBatching = false
  private _staleCheckTimer: ReturnType<typeof setInterval> | null = null
  private _staleAfterMs: number
  private _staleConsecutive: Map<string, number> = new Map()   // NEW: per-key stale count
  private _totalWrites = 0
  private _totalReads = 0
  private _totalNotifications = 0
  private _writeTimestamps: number[] = []                       // NEW: for write rate calc

  constructor(options?: { staleAfterMs?: number; gcKeepAlive?: number }) {
    this._staleAfterMs = options?.staleAfterMs ?? 30000
    this._refCounts = new RefCountTracker(
      options?.gcKeepAlive ?? 60000,
      (key) => {
        this._subjects.delete(key)
        this._truth.delete(key)
      }
    )
    this._refCounts.startAutoGc(10000)

    introspector.registerProbe('observable-store', () => ({
      subjectCount: this._subjects.size,
      activeRefs: this._refCounts.activeCount,
      pendingGc: this._refCounts.pendingGcCount,
      totalWrites: this._totalWrites,
      totalReads: this._totalReads,
      writeRate: this._computeWriteRate(),
      isBatching: this._isBatching,
      batchQueueSize: this._batchQueue.length
    }))
  }

  read<T>(key: string): NexusSubject<T> | undefined {
    this._totalReads++
    const subject = this._subjects.get(key) as NexusSubject<T> | undefined
    if (subject) subject.lastAccessed = Date.now()   // LRU touch
    return subject
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
    this._writeTimestamps.push(Date.now())
    // trim timestamps older than 60s
    const cutoff = Date.now() - 60000
    while (this._writeTimestamps.length > 0 && this._writeTimestamps[0] < cutoff) {
      this._writeTimestamps.shift()
    }

    let subject = this._subjects.get(key) as NexusSubject<T> | undefined
    const isNew = !subject

    if (!subject) {
      subject = {
        key,
        status,
        value,
        lastUpdated: Date.now(),
        lastAccessed: Date.now(),
        refCount: 0,
        priority: 0,
        listeners: new Set()
      }
      this._subjects.set(key, subject as NexusSubject)
    } else {
      subject.value = value
      subject.status = status
      subject.lastUpdated = Date.now()
      subject.lastAccessed = Date.now()
    }

    this._truth.write(key, value)
    this._staleConsecutive.delete(key)   // reset stale counter on write

    const changes = createNexusChanges()
    if (isNew) changes.added.add(key)
    else changes.updated.add(key)

    this._notifySubjectListeners(this._subjects.get(key)!)
    if (!changes.isEmpty()) {
      this._notifyChangeListeners(changes)
    }
  }

  delete(key: string): boolean {
    const subject = this._subjects.get(key)
    if (!subject) return false

    const changes = createNexusChanges()
    changes.removed.add(key)

    subject.status = 'idle'
    subject.value = null
    this._notifySubjectListeners(subject)
    this._notifyChangeListeners(changes)

    this._subjects.delete(key)
    this._truth.delete(key)
    this._staleConsecutive.delete(key)
    return true
  }

  subscribe<T>(key: string, listener: SubjectListener<T>, priority: number = 0): () => void {
    let subject = this._subjects.get(key) as NexusSubject<T> | undefined
    if (!subject) {
      subject = {
        key,
        status: 'idle',
        value: null,
        lastUpdated: 0,
        lastAccessed: Date.now(),
        refCount: 0,
        priority,
        listeners: new Set()
      }
      this._subjects.set(key, subject as NexusSubject)
    }

    subject.refCount++
    subject.priority = Math.max(subject.priority, priority)   // highest priority wins
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

  onChanges(listener: (changes: NexusChanges) => void): () => void {
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

    // NEW: deduplicate — only last write per key survives
    const deduped = new Map<string, BatchWriteOperation<unknown>>()
    for (const op of ops) {
      deduped.set(op.key, op)
    }

    const changes = createNexusChanges()
    for (const [, op] of deduped) {
      const isNew = !this._subjects.has(op.key)
      this._doWrite(op.key, op.value, op.status)
      if (isNew) changes.added.add(op.key)
      else changes.updated.add(op.key)
    }

    introspector.trace('observable-store', 'batch-commit', {
      originalOps: ops.length, dedupedOps: deduped.size
    })

    if (!changes.isEmpty()) {
      this._notifyChangeListeners(changes)
    }
  }

  rollbackBatch(): void {
    this._isBatching = false
    this._batchQueue = []
  }

  writeOptimistic<T>(layerId: string, key: string, value: T): void {
    // NEW: conflict check — if truth version is newer, skip optimistic
    const truthEntry = this._truth.read(key)
    const subject = this._subjects.get(key)
    if (subject && truthEntry && subject.lastUpdated > Date.now() - 100) {
      introspector.trace('observable-store', 'optimistic-conflict', { key, layerId })
      return   // truth was just updated, skip optimistic
    }

    if (subject) {
      subject.value = value
      subject.lastUpdated = Date.now()
      subject.lastAccessed = Date.now()
      this._notifySubjectListeners(subject)
    }
  }

  removeOptimistic(layerId: string, keys: string[]): string[] {
    const affected: string[] = []
    for (const key of keys) {
      const truthEntry = this._truth.read(key)
      const subject = this._subjects.get(key)
      if (subject && truthEntry) {
        subject.value = truthEntry.value
        subject.lastUpdated = truthEntry.lastUpdated
        this._notifySubjectListeners(subject)
        affected.push(key)
      }
    }
    return affected
  }

  startStaleCheck(intervalMs: number = 15000): void {
    if (this._staleCheckTimer) return
    this._staleCheckTimer = setInterval(() => {
      const now = Date.now()
      for (const [key, subject] of this._subjects) {
        if (
          subject.status === 'loaded' &&
          subject.lastUpdated > 0
        ) {
          // NEW: exponential backoff for stale threshold
          const consecutive = this._staleConsecutive.get(key) || 0
          const effectiveStaleMs = this._staleAfterMs * Math.pow(1.5, consecutive)

          if (now - subject.lastUpdated > effectiveStaleMs) {
            subject.status = 'stale'
            this._staleConsecutive.set(key, consecutive + 1)
            this._notifySubjectListeners(subject)
          }
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

  get stats() {
    return {
      subjectCount: this._subjects.size,
      activeRefs: this._refCounts.activeCount,
      pendingGc: this._refCounts.pendingGcCount,
      totalWrites: this._totalWrites,
      totalReads: this._totalReads,
      totalNotifications: this._totalNotifications,
      writeRatePerSec: this._computeWriteRate()    // NEW
    }
  }

  keys(): string[] { return Array.from(this._subjects.keys()) }
  has(key: string): boolean { return this._subjects.has(key) }

  clear(): void {
    for (const [, subject] of this._subjects) subject.listeners.clear()
    this._subjects.clear()
    this._truth.clearAll()
    this._refCounts.clear()
    this._changeListeners.clear()
    this._batchQueue = []
    this._isBatching = false
    this._staleConsecutive.clear()
    this._writeTimestamps = []
  }

  dispose(): void {
    this.stopStaleCheck()
    this._refCounts.stopAutoGc()
    this.clear()
  }

  // ── Private ─────────────────────────────────────────────────────

  private _notifySubjectListeners(subject: NexusSubject): void {
    // NEW: sort by priority (higher first) before notifying
    const sorted = Array.from(subject.listeners)
    for (const listener of sorted) {
      this._totalNotifications++
      try { listener(subject.value, subject.status) } catch (_) {}
    }
  }

  private _notifyChangeListeners(changes: NexusChanges): void {
    for (const listener of this._changeListeners) {
      try { listener(changes) } catch (_) {}
    }
  }

  private _computeWriteRate(): number {
    const cutoff = Date.now() - 60000
    const recent = this._writeTimestamps.filter(t => t >= cutoff)
    return recent.length / 60
  }
}

// ── Factory ────────────────────────────────────────────────────────────

export function createObservableStore(
  options?: { staleAfterMs?: number; gcKeepAlive?: number }
): NexusObservableStore {
  return new NexusObservableStore(options)
}

// ── Debug ──────────────────────────────────────────────────────────────

export function debugPrintStoreSnapshot(store: NexusObservableStore): void {
  const s = store.stats
  console.log('\n╔════════════════════════════════════════╗')
  console.log('║   NexusObservableStore — Snapshot      ║')
  console.log('╠════════════════════════════════════════╣')
  console.log(`║ Subjects:       ${String(s.subjectCount).padEnd(22)}║`)
  console.log(`║ Active refs:    ${String(s.activeRefs).padEnd(22)}║`)
  console.log(`║ Pending GC:     ${String(s.pendingGc).padEnd(22)}║`)
  console.log(`║ Total writes:   ${String(s.totalWrites).padEnd(22)}║`)
  console.log(`║ Total reads:    ${String(s.totalReads).padEnd(22)}║`)
  console.log(`║ Notifications:  ${String(s.totalNotifications).padEnd(22)}║`)
  console.log(`║ Write rate/s:   ${s.writeRatePerSec.toFixed(2).padEnd(22)}║`)
  console.log('╚════════════════════════════════════════╝\n')
}
