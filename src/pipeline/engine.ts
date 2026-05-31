/**
 * NexusPipeline + NexusEngine 主引擎
 *
 * 来源：原项目 src/shared/utils/engine.ts 中的 PantheonPipeline + PantheonEngine
 * 改动（~20%）：
 *   1. Pipeline增加runReport：每次execute输出完整的阶段耗时报告
 *   2. Engine构造器注入introspector全局状态探针
 *   3. runCoachPipeline增加前后调试快照
 *   4. histogram计算独立为方法，增加调试输出
 *   5. 引擎销毁逻辑增加checkpoint
 */

import {
  PipelineStageContext,
  PipelineStageHandler,
  Advice,
  NexusScore,
  PipelineRunReport,
  HistogramResult,
  ScoreBucket,
  GamePhase,
  GamesAnalysisAll
} from '../types'
import { STAGE_REGISTRY } from './stages'
import { calculateNexusScore } from '../core/scoring'
import { NexusCacheLayers } from '../cache'
import { RingReducer } from '../cache/aggregator'
import { compareTeams, aggregateTeamProfile } from '../cache/aggregator'
import { NexusScheduler, createNexusScheduler, mapQueryPhaseToGamePhase } from '../scheduler'
import { introspector } from '../debug/introspector'

const MODULE = 'engine'

// ── Pipeline ──

export class NexusPipeline {
  private _stages: { name: string; handler: PipelineStageHandler }[] = []

  addStage(name: string, handler: PipelineStageHandler): void {
    this._stages.push({ name, handler })
  }

  removeStage(name: string): boolean {
    const idx = this._stages.findIndex(s => s.name === name)
    if (idx >= 0) { this._stages.splice(idx, 1); return true }
    return false
  }

  get stageNames(): string[] {
    return this._stages.map(s => s.name)
  }

  /**
   * 执行pipeline，输出最终context + 运行报告（新增）
   */
  execute(initialCtx: PipelineStageContext): { ctx: PipelineStageContext; report: PipelineRunReport } {
    let ctx = initialCtx
    const stageTimings: Record<string, number> = {}
    const stageErrors: Record<string, string> = {}
    const pipelineStart = Date.now()

    for (const stage of this._stages) {
      ctx = { ...ctx, stage: stage.name }
      const t0 = Date.now()
      try {
        ctx = stage.handler(ctx)
      } catch (error: any) {
        const msg = error?.message ?? String(error)
        stageErrors[stage.name] = msg
        introspector.error(MODULE, `Stage "${stage.name}" failed: ${msg}`)
      }
      stageTimings[stage.name] = Date.now() - t0
    }

    const report: PipelineRunReport = {
      totalMs: Date.now() - pipelineStart,
      stageTimings,
      stageErrors,
      adviceCount: ctx.advices.length,
      stagesRun: this._stages.length
    }

    introspector.checkpoint(MODULE, 'pipeline_execute_done', {
      totalMs: report.totalMs,
      adviceCount: report.adviceCount,
      stageErrors: Object.keys(stageErrors)
    })

    return { ctx, report }
  }
}

// ── Histogram ──

function classifyScoreTier(scoreTotal: number): 'top' | 'high' | 'mid' | 'low' | 'bottom' {
  // 改动：阈值微调（原80/60/40/20 → 78/58/38/18）
  if (scoreTotal >= 78) return 'top'
  if (scoreTotal >= 58) return 'high'
  if (scoreTotal >= 38) return 'mid'
  if (scoreTotal >= 18) return 'low'
  return 'bottom'
}

function computeTeamScorePass(
  puuids: string[],
  analyses: Record<string, GamesAnalysisAll>
): { total: number; count: number; perPlayer: Record<string, NexusScore> } {
  let total = 0, count = 0
  const perPlayer: Record<string, NexusScore> = {}
  for (const puuid of puuids) {
    const analysis = analyses[puuid]
    if (!analysis) continue
    const score = calculateNexusScore(analysis)
    perPlayer[puuid] = score
    total += score.total
    count++
  }
  return { total, count, perPlayer }
}

export function computeHistogramPass(
  allyPuuids: string[],
  enemyPuuids: string[],
  analyses: Record<string, GamesAnalysisAll>
): HistogramResult {
  const start = Date.now()

  const allyPass = computeTeamScorePass(allyPuuids, analyses)
  const enemyPass = computeTeamScorePass(enemyPuuids, analyses)

  const allyAvg = allyPass.count > 0 ? allyPass.total / allyPass.count : 0
  const enemyAvg = enemyPass.count > 0 ? enemyPass.total / enemyPass.count : 0

  const buildBuckets = (
    puuids: string[],
    perPlayer: Record<string, NexusScore>
  ): ScoreBucket[] => {
    const buckets: ScoreBucket[] = []
    for (const puuid of puuids) {
      const score = perPlayer[puuid]
      if (!score) continue
      const analysis = analyses[puuid]
      buckets.push({
        puuid,
        score,
        winRate: analysis?.summary.winRate ?? 0,
        kdaAvg: analysis?.summary.averageKda ?? 0,
        gamesPlayed: analysis?.summary.count ?? 0,
        tier: classifyScoreTier(score.total)
      })
    }
    return buckets
  }

  const allyBuckets = buildBuckets(allyPuuids, allyPass.perPlayer)
  const enemyBuckets = buildBuckets(enemyPuuids, enemyPass.perPlayer)

  const countTiers = (buckets: ScoreBucket[]): Record<string, number> => {
    const dist: Record<string, number> = { top: 0, high: 0, mid: 0, low: 0, bottom: 0 }
    for (const b of buckets) dist[b.tier]++
    return dist
  }

  const result: HistogramResult = {
    allyBuckets,
    enemyBuckets,
    allyScoreTotal: allyPass.total,
    allyScoreCount: allyPass.count,
    enemyScoreTotal: enemyPass.total,
    enemyScoreCount: enemyPass.count,
    allyPerPlayer: allyPass.perPlayer,
    enemyPerPlayer: enemyPass.perPlayer,
    allyAvg,
    enemyAvg,
    scoreDiff: allyAvg - enemyAvg,
    tierDistribution: {
      ally: countTiers(allyBuckets),
      enemy: countTiers(enemyBuckets)
    },
    latencyMs: Date.now() - start
  }

  introspector.debug(MODULE, 'histogram_computed', {
    allyAvg: allyAvg.toFixed(2),
    enemyAvg: enemyAvg.toFixed(2),
    scoreDiff: result.scoreDiff.toFixed(2),
    latencyMs: result.latencyMs
  })

  return result
}

// ── RingAggregator（辅助类）──

export class RingAggregator {
  private _dims: { name: string; weight: number; value: number }[] = []

  addDimension(name: string, weight: number, value: number): void {
    this._dims.push({ name, weight, value })
  }

  reduce(): { score: number; breakdown: Record<string, number> } {
    if (this._dims.length === 0) return { score: 0, breakdown: {} }
    const totalWeight = this._dims.reduce((s, d) => s + d.weight, 0)
    if (totalWeight === 0) return { score: 0, breakdown: {} }

    const breakdown: Record<string, number> = {}
    let score = 0
    for (const d of this._dims) {
      const contrib = (d.value * d.weight) / totalWeight
      breakdown[d.name] = contrib
      score += contrib
    }
    return { score, breakdown }
  }

  reset(): void { this._dims = [] }
}

// ── Rank Utilities ──

const TIER_ORDER: Record<string, number> = {
  IRON: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4,
  EMERALD: 5, DIAMOND: 6, MASTER: 7, GRANDMASTER: 8, CHALLENGER: 9
}
const DIVISION_ORDER: Record<string, number> = { IV: 0, III: 1, II: 2, I: 3 }

export function rankToNumeric(tier: string, division: string): number {
  const t = TIER_ORDER[tier] ?? -1
  if (t < 0) return -1
  return t * 4 + (DIVISION_ORDER[division] ?? 0)
}

const TIER_CN: Record<string, string> = {
  IRON: '黑铁', BRONZE: '青铜', SILVER: '白银', GOLD: '黄金',
  PLATINUM: '铂金', EMERALD: '翡翠', DIAMOND: '钻石',
  MASTER: '大师', GRANDMASTER: '宗师', CHALLENGER: '王者'
}

export function rankToLabel(tier: string, division: string): string {
  if (!tier || tier === 'UNRANKED' || tier === '') return '未定级'
  return `${TIER_CN[tier] || tier}${division}`
}

// ── NexusEngine ──

export interface NexusEngineConfig {
  schedulerConfig?: Record<string, unknown>
  cacheMaxAge?: number
  enableAutoSchedule?: boolean
}

export class NexusEngine {
  private _pipeline: NexusPipeline
  private _cache: NexusCacheLayers<Advice[]>
  private _scheduler: NexusScheduler
  private _aggregationReducer: RingReducer<number>
  private _lastHistogram: HistogramResult | null = null
  private _lastReport: PipelineRunReport | null = null
  private _runCount = 0
  private _config: NexusEngineConfig
  private _disposed = false

  constructor(config?: NexusEngineConfig) {
    this._config = config ?? {}
    this._pipeline = new NexusPipeline()

    // 注册所有stage（与原项目顺序一致）
    const stageOrder = [
      'enemy_weakness', 'team_synergy', 'macro_strategy', 'self_analysis',
      'premade_detection', 'rank_disparity', 'lane_matchup', 'composition',
      'itemization', 'objective_timing', 'playstyle_adaptation', 'gold_efficiency',
      'true_damage_warning', 'cherry_strategy', 'win_condition', 'kda_trend'
    ]
    for (const name of stageOrder) {
      const handler = STAGE_REGISTRY[name]
      if (handler) this._pipeline.addStage(name, handler)
    }

    this._cache = new NexusCacheLayers<Advice[]>()
    this._scheduler = createNexusScheduler(this._config.schedulerConfig as any)
    this._aggregationReducer = new RingReducer<number>((acc, cur) => acc + cur, 0)

    // 注册全局引擎探针（新增）
    introspector.registerProbe(MODULE, 'engine_state', () => ({
      runCount: this._runCount,
      disposed: this._disposed,
      pipelineStages: this._pipeline.stageNames,
      schedulerPhase: this._scheduler.currentPhase,
      cacheStats: this._cache.debugStats(),
      lastReport: this._lastReport
    }))

    introspector.info(MODULE, 'NexusEngine initialized', {
      stageCount: stageOrder.length,
      config: this._config
    })
  }

  get scheduler(): NexusScheduler { return this._scheduler }
  get pipeline(): NexusPipeline { return this._pipeline }
  get lastHistogram(): HistogramResult | null { return this._lastHistogram }
  get lastReport(): PipelineRunReport | null { return this._lastReport }
  get runCount(): number { return this._runCount }

  /**
   * 运行完整的教练Pipeline
   */
  runCoachPipeline(params: {
    selfPuuid: string
    allyPuuids: string[]
    enemyPuuids: string[]
    playerAnalyses: Record<string, GamesAnalysisAll>
    championSelections: Record<string, number>
    positionAssignments: Record<string, { position: string; role: string | null }>
    gameMode: string
    queueType: string
    currentGamePhase?: GamePhase
    profile?: any
  }): { advices: Advice[]; report: PipelineRunReport; histogram: HistogramResult } {
    if (this._disposed) throw new Error('Engine has been disposed')

    this._runCount++
    const runId = `run_${this._runCount}`

    introspector.checkpoint(MODULE, `${runId}_start`, {
      selfPuuid: params.selfPuuid.slice(0, 8) + '...',
      allyCount: params.allyPuuids.length,
      enemyCount: params.enemyPuuids.length,
      gameMode: params.gameMode,
      phase: params.currentGamePhase ?? 'unknown'
    })

    // 计算histogram
    const allAlly = [params.selfPuuid, ...params.allyPuuids]
    const histogram = computeHistogramPass(allAlly, params.enemyPuuids, params.playerAnalyses)
    this._lastHistogram = histogram

    // 团队对比
    const teamComparison = compareTeams(
      allAlly, params.enemyPuuids, params.playerAnalyses
    )

    // 阶段转换
    const phase = params.currentGamePhase ?? 'unknown'
    this._scheduler.transitionPhase(phase)

    // 构造初始context
    const initialCtx: PipelineStageContext = {
      stage: '__init__',
      advices: [],
      intermediates: {},
      playerAnalyses: params.playerAnalyses,
      championSelections: params.championSelections,
      positionAssignments: params.positionAssignments,
      selfPuuid: params.selfPuuid,
      allyPuuids: params.allyPuuids,
      enemyPuuids: params.enemyPuuids,
      gameMode: params.gameMode,
      queueType: params.queueType,
      teamComparison,
      currentGamePhase: phase,
      profile: params.profile ?? null,
      histogram,
      __debug_stageTimings: {}
    }

    // 执行Pipeline
    const { ctx: finalCtx, report } = this._pipeline.execute(initialCtx)
    this._lastReport = report

    // 调度建议
    if (this._config.enableAutoSchedule !== false) {
      this._scheduler.enqueue(finalCtx.advices)
    }

    introspector.checkpoint(MODULE, `${runId}_done`, {
      adviceCount: finalCtx.advices.length,
      totalMs: report.totalMs,
      histogram: {
        allyAvg: histogram.allyAvg.toFixed(2),
        enemyAvg: histogram.enemyAvg.toFixed(2),
        diff: histogram.scoreDiff.toFixed(2)
      }
    })

    return {
      advices: finalCtx.advices,
      report,
      histogram
    }
  }

  /**
   * 从调度器取出建议
   */
  dequeueAdvices(count: number = 5): Advice[] {
    const scheduled = this._scheduler.dequeue(count)
    return scheduled.map(s => s.advice)
  }

  /**
   * 清理引擎状态
   */
  dispose(): void {
    if (this._disposed) return
    this._disposed = true
    this._scheduler.clear()
    this._cache.clear()

    introspector.info(MODULE, 'NexusEngine disposed', {
      totalRuns: this._runCount
    })
  }
}

// ── 调试辅助 ──

export function debugPrintHistogram(hist: HistogramResult): void {
  console.log('\n── Histogram ──')
  console.log(`  Ally  Avg: ${hist.allyAvg.toFixed(2)} (${hist.allyScoreCount} players)`)
  console.log(`  Enemy Avg: ${hist.enemyAvg.toFixed(2)} (${hist.enemyScoreCount} players)`)
  console.log(`  Diff: ${hist.scoreDiff >= 0 ? '+' : ''}${hist.scoreDiff.toFixed(2)}`)
  console.log(`  Latency: ${hist.latencyMs}ms`)

  const printBuckets = (label: string, buckets: ScoreBucket[]) => {
    console.log(`  ${label}:`)
    for (const b of buckets) {
      console.log(`    [${b.tier.toUpperCase().padEnd(6)}] score=${b.score.total.toFixed(1)} wr=${(b.winRate * 100).toFixed(0)}% kda=${b.kdaAvg.toFixed(2)} (${b.gamesPlayed}games)`)
    }
  }

  printBuckets('ALLY', hist.allyBuckets)
  printBuckets('ENEMY', hist.enemyBuckets)
  console.log('─'.repeat(40))
}

export function debugPrintPipelineReport(report: PipelineRunReport): void {
  console.log('\n── Pipeline Report ──')
  console.log(`  Total: ${report.totalMs}ms | Stages: ${report.stagesRun} | Advices: ${report.adviceCount}`)
  for (const [stage, ms] of Object.entries(report.stageTimings)) {
    const err = report.stageErrors[stage]
    const status = err ? `ERROR: ${err}` : `${ms}ms`
    console.log(`    ${stage.padEnd(24)} ${status}`)
  }
  console.log('─'.repeat(40))
}

export function createNexusEngine(config?: NexusEngineConfig): NexusEngine {
  return new NexusEngine(config)
}
