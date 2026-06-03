// @ts-nocheck
/**
 * ReactiveStore — OSDK-pattern layered cache with instant subscriber push
 *
 * Architecture from palantir/osdk-ts observable/internal:
 *   Layer.ts    → NexusLayer       (linked-list cache chain)
 *   Layers.ts   → NexusLayers      (truth + optimistic stack, batch commit)
 *   Subjects.ts → NexusSubject     (BehaviorSubject-like instant push)
 *   BatchContext→ NexusBatchContext (atomic multi-write)
 *   RefCounts   → NexusRefCounts   (microtask-deferred GC)
 *
 * Core change:  write(key, val) → Subject.next() → all subscribers fire (~0ms)
 */

import { introspector, StructWatcher } from '../debug/introspector'
const MODULE = 'reactive-store'

// ── Types ──
export type CacheStatus = 'init' | 'loading' | 'loaded' | 'error' | 'stale'
export interface CacheEntry<T = unknown> {
  key: string; value: T | undefined; lastUpdated: number
  status: CacheStatus; isOptimistic: boolean
}
export type OptimisticId = string & { __brand: 'OptimisticId' }
export function createOptimisticId(): OptimisticId {
  return `opt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}` as OptimisticId
}

// ── NexusSubject ──
export type SubjectObserver<T = unknown> = (payload: CacheEntry<T>) => void

export class NexusSubject<T = unknown> {
  private _obs: SubjectObserver<T>[] = []
  private _val: CacheEntry<T>
  private _closed = false
  constructor(init: CacheEntry<T>) { this._val = init }
  get value() { return this._val }
  get observerCount() { return this._obs.length }
  next(p: CacheEntry<T>) {
    if (this._closed) return; this._val = p
    for (const o of this._obs) { try { o(p) } catch {} }
  }
  subscribe(o: SubjectObserver<T>): () => void {
    if (this._closed) return () => {}
    this._obs.push(o); try { o(this._val) } catch {}
    return () => { const i = this._obs.indexOf(o); if (i >= 0) this._obs.splice(i, 1) }
  }
  close() { this._closed = true; this._obs = [] }
}

// ── NexusLayer ──
export class NexusLayer {
  private _parent: NexusLayer | undefined
  private _cache = new Map<string, CacheEntry>()
  private _layerId: OptimisticId | undefined
  constructor(parent?: NexusLayer, layerId?: OptimisticId) { this._parent = parent; this._layerId = layerId }
  get parentLayer() { return this._parent }
  get layerId() { return this._layerId }
  get localSize() { return this._cache.size }
  addLayer(id: OptimisticId) { return new NexusLayer(this, id) }
  removeLayer(id: OptimisticId): NexusLayer {
    if (!id || !this._parent) return this
    if (this._layerId === id) return this._parent.removeLayer(id)
    this._parent = this._parent.removeLayer(id); return this
  }
  get(key: string): CacheEntry | undefined { return this._cache.get(key) ?? this._parent?.get(key) }
  set(key: string, e: CacheEntry) { this._cache.set(key, e) }
  entries() { return this._cache.entries() }
}

// ── NexusBatchContext ──
export interface NexusBatchContext {
  optimisticWrite: boolean
  writtenKeys: Set<string>
  write(key: string, value: unknown, status: CacheStatus): CacheEntry
  read(key: string): CacheEntry | undefined
  delete(key: string): void
}

// ── NexusRefCounts (microtask-deferred GC) ──
export class NexusRefCounts {
  private _refs = new Map<string, number>()
  private _gc = new Map<string, number>()
  private _pending = new Map<string, number>()
  private _timer: ReturnType<typeof setInterval> | null = null
  constructor(private _keepAlive: number, private _cleanup: (k: string) => void) {}
  retain(k: string) { this._refs.set(k, (this._refs.get(k) ?? 0) + 1); this._gc.delete(k); this._pending.delete(k) }
  release(k: string) {
    const c = this._refs.get(k); if (!c) return
    if (c <= 1) {
      this._refs.delete(k)
      const p = (this._pending.get(k) ?? 0) + 1; this._pending.set(k, p)
      queueMicrotask(() => {
        const cur = this._pending.get(k) ?? 0
        if (cur <= 1) { this._pending.delete(k); if (!this._refs.has(k)) this._gc.set(k, Date.now() + this._keepAlive) }
        else this._pending.set(k, cur - 1)
      })
    } else this._refs.set(k, c - 1)
  }
  gc() { const now = Date.now(); for (const [k, t] of this._gc) { if (t < now) { this._gc.delete(k); this._cleanup(k) } } }
  startAutoGc(ms = 5000) { if (!this._timer) this._timer = setInterval(() => this.gc(), ms) }
  stopAutoGc() { if (this._timer) { clearInterval(this._timer); this._timer = null } }
  debugStats() { return { retained: this._refs.size, pendingGc: this._gc.size } }
}

// ── NexusLayers ──
export class NexusLayers {
  private _truth = new NexusLayer()
  private _top: NexusLayer
  private _subjects = new Map<string, NexusSubject>()
  private _onInvalidate: ((keys: string[]) => void) | null = null
  constructor() { this._top = this._truth }
  get top() { return this._top }
  get truth() { return this._truth }
  get subjectCount() { return this._subjects.size }
  setInvalidateCallback(cb: (keys: string[]) => void) { this._onInvalidate = cb }

  getSubject(key: string): NexusSubject {
    let s = this._subjects.get(key)
    if (!s) {
      const init = this._top.get(key) ?? { key, value: undefined, lastUpdated: 0, status: 'init' as CacheStatus, isOptimistic: false }
      s = new NexusSubject(init); this._subjects.set(key, s)
    }
    return s
  }
  deleteSubject(k: string) { this._subjects.get(k)?.close(); this._subjects.delete(k) }

  removeOptimisticLayer(id: OptimisticId) {
    let cur: NexusLayer | undefined = this._top; const affected = new Set<string>()
    while (cur?.parentLayer) { if (cur.layerId === id) for (const [k] of cur.entries()) affected.add(k); cur = cur.parentLayer }
    this._top = this._top.removeLayer(id)
    for (const k of affected) {
      const ne = this._top.get(k), te = this._truth.get(k), s = this._subjects.get(k)
      if (s) s.next({ key: k, value: ne?.value, lastUpdated: ne?.lastUpdated ?? Date.now(), status: ne?.status ?? 'init', isOptimistic: ne?.value !== te?.value })
    }
    introspector.debug(MODULE, `Layer removed: ${id}`, { affected: affected.size })
  }

  batch<R>(opts: { optimisticId?: OptimisticId }, fn: (ctx: NexusBatchContext) => R): { result: R; writtenKeys: Set<string> } {
    const { optimisticId } = opts; let needsLayer = !!optimisticId; const wk = new Set<string>()
    const ctx: NexusBatchContext = {
      optimisticWrite: !!optimisticId, writtenKeys: wk,
      write: (key, value, status) => {
        const old = this._top.get(key)
        if (optimisticId && needsLayer) { this._top = this._top.addLayer(optimisticId); needsLayer = false }
        const layer = optimisticId ? this._top : this._truth
        const entry: CacheEntry = { key, value, lastUpdated: Date.now(), status, isOptimistic: !!optimisticId }
        layer.set(key, entry); wk.add(key)
        const newTop = this._top.get(key)
        if (old !== newTop) { const s = this._subjects.get(key); if (s) s.next({ ...entry, isOptimistic: newTop?.value !== this._truth.get(key)?.value }) }
        return entry
      },
      read: (key) => optimisticId ? this._top.get(key) : this._truth.get(key),
      delete: (key) => { (optimisticId ? this._top : this._truth).set(key, { key, value: undefined, lastUpdated: Date.now(), status: 'loaded', isOptimistic: !!optimisticId } as CacheEntry); wk.add(key) }
    }
    const result = fn(ctx)
    if (this._onInvalidate && wk.size > 0) this._onInvalidate([...wk])
    introspector.checkpoint(MODULE, 'batch', { optimistic: !!optimisticId, keys: wk.size })
    return { result, writtenKeys: wk }
  }

  debugSnapshot() {
    const stack: string[] = []; let c: NexusLayer | undefined = this._top
    while (c) { stack.push(c.layerId ?? '__truth__'); c = c.parentLayer }
    return { layerStack: stack, subjects: this._subjects.size, truthSize: this._truth.localSize }
  }
}

// ── ReactiveStore ──
export interface ReactiveStoreConfig { refCountKeepAlive?: number; gcIntervalMs?: number }

export class ReactiveStore {
  private _layers = new NexusLayers()
  private _refs: NexusRefCounts
  private _stageMap = new Map<string, Set<string>>()
  private _stats = { writes: 0, reads: 0, batches: 0, optimisticOps: 0, invalidations: 0 }

  constructor(cfg?: ReactiveStoreConfig) {
    this._refs = new NexusRefCounts(cfg?.refCountKeepAlive ?? 30_000, (k) => this._layers.deleteSubject(k))
    if (cfg?.gcIntervalMs !== 0) this._refs.startAutoGc(cfg?.gcIntervalMs ?? 5000)
    this._layers.setInvalidateCallback((keys) => {
      this._stats.invalidations++
      const stages = new Set<string>()
      for (const k of keys) { const s = this._stageMap.get(k); if (s) for (const st of s) stages.add(st) }
      if (stages.size > 0) introspector.info(MODULE, `Invalidation → ${[...stages].join(',')}`, { keys: keys.length })
    })
    introspector.registerProbe(MODULE, 'store', () => ({ ...this._stats, refs: this._refs.debugStats(), layers: this._layers.debugSnapshot() }))
  }

  get layers() { return this._layers }
  write(key: string, value: unknown, status: CacheStatus = 'loaded') { this._stats.writes++; this._layers.batch({}, c => c.write(key, value, status)); return this._layers.top.get(key)! }
  read(key: string) { this._stats.reads++; return this._layers.top.get(key) }
  subscribe(key: string, obs: SubjectObserver): () => void {
    this._refs.retain(key); const unsub = this._layers.getSubject(key).subscribe(obs)
    return () => { unsub(); this._refs.release(key) }
  }
  batch<R>(fn: (ctx: NexusBatchContext) => R) { this._stats.batches++; return this._layers.batch({}, fn).result }
  applyOptimistic(fn: (ctx: NexusBatchContext) => void) {
    const id = createOptimisticId(); this._stats.optimisticOps++; this._layers.batch({ optimisticId: id }, fn)
    return { optimisticId: id, rollback: () => this._layers.removeOptimisticLayer(id) }
  }
  confirmOptimistic(id: OptimisticId, truth: Record<string, unknown>) {
    this._layers.batch({}, c => { for (const [k, v] of Object.entries(truth)) c.write(k, v, 'loaded') })
    this._layers.removeOptimisticLayer(id)
  }
  registerStageInterest(stage: string, keys: string[]) {
    for (const k of keys) { if (!this._stageMap.has(k)) this._stageMap.set(k, new Set()); this._stageMap.get(k)!.add(stage) }
  }
  dispose() { this._refs.stopAutoGc(); this._stageMap.clear() }
  getStats() { return { ...this._stats } }
}

export function createReactiveStore(cfg?: ReactiveStoreConfig) { return new ReactiveStore(cfg) }
export function debugPrintStoreSnapshot(s: ReactiveStore) {
  const st = s.getStats(), l = s.layers.debugSnapshot()
  console.log(`\n── ReactiveStore ──\n  W:${st.writes} R:${st.reads} B:${st.batches} Opt:${st.optimisticOps} Inv:${st.invalidations}\n  Layers: ${(l.layerStack as string[]).join('→')} | Subjects:${l.subjects}\n${'─'.repeat(40)}`)
}
