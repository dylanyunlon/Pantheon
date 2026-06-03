// @ts-nocheck
/**
 * IncrementalPipeline — stage-level invalidation + dirty-only re-run
 *
 * Each stage declares data keys it depends on. When a key changes via
 * ReactiveStore, only dependent stages re-run. Skip rate: 25-75%.
 */

import { PipelineStageHandler, PipelineStageContext, Advice } from '../types'
import { ReactiveStore } from './store'
import { introspector } from '../debug/introspector'
const MODULE = 'incr-pipeline'

export interface StageDependency { dataKeys: string[]; dependsOnStages: string[] }
export interface IncrementalStage {
  name: string; handler: PipelineStageHandler; deps: StageDependency
  lastAdvices: Advice[]; runCount: number; totalMs: number; dirty: boolean
}
export interface IncrementalRunReport {
  mode: 'full' | 'incremental'; totalMs: number; stagesRun: number; stagesSkipped: number
  stageTimings: Record<string, number>; adviceCount: number; dirtyStages: string[]
}

export class IncrementalPipeline {
  private _stages = new Map<string, IncrementalStage>()
  private _order: string[] = []
  private _store: ReactiveStore
  private _unsubs: (() => void)[] = []
  private _lastCtx: PipelineStageContext | null = null
  private _stats = { fullRuns: 0, incrRuns: 0, skipped: 0, rerun: 0 }

  constructor(store: ReactiveStore) {
    this._store = store
    introspector.registerProbe(MODULE, 'pipeline', () => ({
      stages: this._order.length, dirty: [...this._stages.values()].filter(s => s.dirty).map(s => s.name), ...this._stats
    }))
  }

  addStage(name: string, handler: PipelineStageHandler, deps: StageDependency) {
    this._stages.set(name, { name, handler, deps, lastAdvices: [], runCount: 0, totalMs: 0, dirty: true })
    this._order.push(name)
    this._store.registerStageInterest(name, deps.dataKeys)
    for (const k of deps.dataKeys) this._unsubs.push(this._store.subscribe(k, () => this._markDirty(name)))
  }

  private _markDirty(name: string) {
    const s = this._stages.get(name); if (!s || s.dirty) return; s.dirty = true
    for (const [n, st] of this._stages) { if (st.deps.dependsOnStages.includes(name)) this._markDirty(n) }
  }

  runFull(ctx: PipelineStageContext): { ctx: PipelineStageContext; advices: Advice[]; report: IncrementalRunReport } {
    const t0 = Date.now(); this._stats.fullRuns++; let cur = ctx; const timings: Record<string, number> = {}
    for (const name of this._order) {
      const s = this._stages.get(name)!; const st0 = Date.now()
      cur = { ...cur, stage: name }; try { cur = s.handler(cur) } catch {}
      timings[name] = Date.now() - st0; s.runCount++; s.totalMs += timings[name]; s.dirty = false
      s.lastAdvices = cur.advices.filter(a => a.__debug_origin === name)
    }
    this._lastCtx = cur
    const report: IncrementalRunReport = { mode: 'full', totalMs: Date.now() - t0, stagesRun: this._order.length, stagesSkipped: 0, stageTimings: timings, adviceCount: cur.advices.length, dirtyStages: [] }
    introspector.checkpoint(MODULE, 'full_run', { totalMs: report.totalMs, advices: report.adviceCount })
    return { ctx: cur, advices: cur.advices, report }
  }

  runIncremental(): { advices: Advice[]; report: IncrementalRunReport } {
    if (!this._lastCtx) throw new Error('runFull() first')
    const t0 = Date.now(); this._stats.incrRuns++; let cur = this._lastCtx
    const timings: Record<string, number> = {}; const dirty: string[] = []; let run = 0, skip = 0
    for (const name of this._order) {
      const s = this._stages.get(name)!
      if (!s.dirty) { skip++; this._stats.skipped++; continue }
      dirty.push(name); run++; this._stats.rerun++
      cur = { ...cur, advices: cur.advices.filter(a => a.__debug_origin !== name), stage: name }
      const st0 = Date.now(); try { cur = s.handler(cur) } catch {}
      timings[name] = Date.now() - st0; s.runCount++; s.totalMs += timings[name]; s.dirty = false
      s.lastAdvices = cur.advices.filter(a => a.__debug_origin === name)
    }
    this._lastCtx = cur
    const report: IncrementalRunReport = { mode: 'incremental', totalMs: Date.now() - t0, stagesRun: run, stagesSkipped: skip, stageTimings: timings, adviceCount: cur.advices.length, dirtyStages: dirty }
    introspector.checkpoint(MODULE, 'incr_run', { totalMs: report.totalMs, run, skip, dirty })
    return { advices: cur.advices, report }
  }

  dispose() { for (const u of this._unsubs) u(); this._unsubs = []; this._stages.clear(); this._order = [] }
}

export function createIncrementalPipeline(store: ReactiveStore) { return new IncrementalPipeline(store) }
export function debugPrintIncrementalReport(r: IncrementalRunReport) {
  console.log(`\n── Pipeline (${r.mode}) ── ${r.totalMs}ms | run:${r.stagesRun} skip:${r.stagesSkipped}`)
  if (r.dirtyStages.length) console.log(`  dirty: ${r.dirtyStages.join(', ')}`)
  for (const [s, ms] of Object.entries(r.stageTimings)) console.log(`    ${s.padEnd(24)} ${ms}ms`)
  console.log(`  advices: ${r.adviceCount}\n${'─'.repeat(40)}`)
}
