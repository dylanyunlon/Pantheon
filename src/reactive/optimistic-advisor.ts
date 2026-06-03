// @ts-nocheck
/**
 * OptimisticAdvisor — champion hover → instant prediction → lock confirms
 *
 * OSDK ActionApplication pattern:
 *   hover champion → optimistic layer predicts advice instantly
 *   lock champion → server data validates → truth replaces optimistic
 *   dodge → rollback → zero residue
 */

import type { Advice, GamePhase } from '../types'
import { ReactiveStore, OptimisticId, createOptimisticId } from './store'
import { IncrementalPipeline } from './incremental-pipeline'
import { introspector } from '../debug/introspector'
const MODULE = 'opt-advisor'

export interface ChampionHoverEvent { puuid: string; championId: number; position: string; timestamp: number }
export interface ChampionLockEvent { puuid: string; championId: number; position: string; confirmed: boolean; timestamp: number }
export interface OptimisticAdviceResult {
  optimisticId: OptimisticId; advices: Advice[]; isOptimistic: true; generatedAt: number
  rollback: () => void; confirm: (serverData: Record<string, unknown>) => void
}
export interface AdvisorConfig { hoverDebounceMs: number; maxOptimisticLayers: number; staleTimeoutMs: number }

const DEFAULTS: AdvisorConfig = { hoverDebounceMs: 150, maxOptimisticLayers: 3, staleTimeoutMs: 30_000 }

export class OptimisticAdvisor {
  private _store: ReactiveStore
  private _pipeline: IncrementalPipeline
  private _cfg: AdvisorConfig
  private _active = new Map<string, { optimisticId: OptimisticId; rollback: () => void; createdAt: number; championId: number }>()
  private _lastHover = new Map<string, number>()
  private _listeners: ((advices: Advice[], optimistic: boolean) => void)[] = []
  private _staleTimer: ReturnType<typeof setInterval> | null = null
  private _stats = { hovers: 0, locks: 0, rollbacks: 0, confirms: 0, stalePurges: 0, totalPredMs: 0 }

  constructor(store: ReactiveStore, pipeline: IncrementalPipeline, cfg?: Partial<AdvisorConfig>) {
    this._store = store; this._pipeline = pipeline; this._cfg = { ...DEFAULTS, ...cfg }
    this._staleTimer = setInterval(() => this._purgeStale(), 5000)
    introspector.registerProbe(MODULE, 'advisor', () => ({ active: this._active.size, ...this._stats }))
  }

  onChampionHover(ev: ChampionHoverEvent): OptimisticAdviceResult | null {
    const { puuid, championId } = ev; this._stats.hovers++
    const last = this._lastHover.get(puuid) ?? 0
    if (Date.now() - last < this._cfg.hoverDebounceMs) return null
    this._lastHover.set(puuid, Date.now())
    this._rollback(puuid)
    if (this._active.size >= this._cfg.maxOptimisticLayers) {
      let oldest: string | null = null, oldestT = Infinity
      for (const [p, o] of this._active) { if (o.createdAt < oldestT) { oldestT = o.createdAt; oldest = p } }
      if (oldest) this._rollback(oldest)
    }
    const t0 = Date.now()
    const { optimisticId, rollback } = this._store.applyOptimistic(ctx => {
      ctx.write(`champion:${puuid}`, championId, 'loading')
      ctx.write(`position:${puuid}`, ev.position, 'loading')
    })
    const { advices } = this._pipeline.runIncremental()
    this._stats.totalPredMs += Date.now() - t0
    this._active.set(puuid, { optimisticId, rollback, createdAt: Date.now(), championId })
    this._notify(advices, true)
    introspector.checkpoint(MODULE, 'hover_predict', { puuid: puuid.slice(0, 8), championId, advices: advices.length, ms: Date.now() - t0 })
    return { optimisticId, advices, isOptimistic: true, generatedAt: Date.now(), rollback: () => this._rollback(puuid), confirm: (d) => this._confirm(puuid, d) }
  }

  onChampionLock(ev: ChampionLockEvent) {
    this._stats.locks++
    if (!ev.confirmed) { this._rollback(ev.puuid); return }
    const a = this._active.get(ev.puuid)
    if (!a) {
      this._store.write(`champion:${ev.puuid}`, ev.championId); this._store.write(`position:${ev.puuid}`, ev.position)
      const { advices } = this._pipeline.runIncremental(); this._notify(advices, false); return
    }
    this._store.confirmOptimistic(a.optimisticId, { [`champion:${ev.puuid}`]: ev.championId, [`position:${ev.puuid}`]: ev.position })
    this._active.delete(ev.puuid)
    const { advices } = this._pipeline.runIncremental(); this._notify(advices, false); this._stats.confirms++
    introspector.checkpoint(MODULE, 'lock_confirm', { puuid: ev.puuid.slice(0, 8), championId: ev.championId })
  }

  onAdviceUpdate(fn: (advices: Advice[], optimistic: boolean) => void): () => void {
    this._listeners.push(fn); return () => { const i = this._listeners.indexOf(fn); if (i >= 0) this._listeners.splice(i, 1) }
  }
  private _notify(a: Advice[], opt: boolean) { for (const l of this._listeners) { try { l(a, opt) } catch {} } }
  private _rollback(p: string) { const a = this._active.get(p); if (a) { a.rollback(); this._active.delete(p); this._stats.rollbacks++ } }
  private _confirm(p: string, d: Record<string, unknown>) { const a = this._active.get(p); if (a) { this._store.confirmOptimistic(a.optimisticId, d); this._active.delete(p); this._stats.confirms++ } }
  private _purgeStale() { const now = Date.now(); for (const [p, o] of this._active) { if (now - o.createdAt > this._cfg.staleTimeoutMs) { this._rollback(p); this._stats.stalePurges++ } } }
  dispose() { if (this._staleTimer) clearInterval(this._staleTimer); for (const [p] of this._active) this._rollback(p); this._listeners = [] }
}

export function createOptimisticAdvisor(s: ReactiveStore, p: IncrementalPipeline, c?: Partial<AdvisorConfig>) { return new OptimisticAdvisor(s, p, c) }
