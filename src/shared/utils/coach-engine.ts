import {
  MatchHistoryGamesAnalysisAll,
  MatchHistoryChampionAnalysis,
  AkariScore,
  calculateAkariScore
} from './analysis'
import { RankedStats } from '@shared/types/league-client/ranked'

export const enum CoachAdvicePriority {
  CRITICAL = 0,
  HIGH = 1,
  MEDIUM = 2,
  LOW = 3,
  INFO = 4
}

export const enum CoachAdviceType {
  LANING_PHASE = 'laning_phase',
  ITEMIZATION = 'itemization',
  TEAMFIGHT = 'teamfight',
  OBJECTIVE = 'objective',
  VISION = 'vision',
  ENEMY_WEAKNESS = 'enemy_weakness',
  TEAM_SYNERGY = 'team_synergy',
  RISK_WARNING = 'risk_warning',
  MACRO_STRATEGY = 'macro_strategy',
  MENTAL = 'mental'
}

export interface CoachAdvice {
  type: CoachAdviceType
  priority: CoachAdvicePriority
  title: string
  message: string
  evidence: string[]
  confidence: number
  audience: 'self' | 'ally' | 'team'
}

export interface PipelineStageContext {
  stage: string
  advices: CoachAdvice[]
  intermediates: Record<string, any>
  playerAnalyses: Record<string, MatchHistoryGamesAnalysisAll>
  teamAnalyses: Record<string, any>
  championSelections: Record<string, number>
  positionAssignments: Record<string, { position: string; role: any }>
  rankedStats: Record<string, { data: RankedStats }>
  selfPuuid: string
  allyPuuids: string[]
  enemyPuuids: string[]
  gameMode: string
  queueType: string
}

type PipelineStageHandler = (ctx: PipelineStageContext) => PipelineStageContext

// Ring-reduce weighted dimensions into a scalar score.
// Modeled after NCCL AllReduce ring topology (nccl/src/collectives.cc).
export class RingAggregator {
  private _dims: { name: string; weight: number; value: number }[] = []

  addDimension(name: string, weight: number, value: number) {
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

  reset() {
    this._dims = []
  }
}

// Extracted standalone team-score pass. Analogous to CCCL f984c90 extracting
// DeviceTopKHistogramKernel from the fused filter_and_histogram.
function computeTeamScorePass(
  puuids: string[],
  analyses: Record<string, MatchHistoryGamesAnalysisAll>
): { total: number; count: number; perPlayer: Record<string, AkariScore> } {
  let total = 0
  let count = 0
  const perPlayer: Record<string, AkariScore> = {}
  for (const puuid of puuids) {
    const analysis = analyses[puuid]
    if (!analysis) continue
    const score = calculateAkariScore(analysis)
    perPlayer[puuid] = score
    total += score.total
    count++
  }
  return { total, count, perPlayer }
}

// Common stage finalization. Mirrors CCCL's finalize_pass: shared skeleton
// with a caller-supplied updater for stage-specific intermediate state.
function finalizeStage(
  ctx: PipelineStageContext,
  newAdvices: CoachAdvice[],
  intermediateUpdates: Record<string, any>
): PipelineStageContext {
  return {
    ...ctx,
    advices: [...ctx.advices, ...newAdvices],
    intermediates: { ...ctx.intermediates, ...intermediateUpdates }
  }
}

function stageEnemyWeakness(ctx: PipelineStageContext): PipelineStageContext {
  const advices: CoachAdvice[] = []

  for (const puuid of ctx.enemyPuuids) {
    const analysis = ctx.playerAnalyses[puuid]
    if (!analysis) continue
    const { summary, champions } = analysis

    if (summary.winRate < 0.4 && summary.count >= 5) {
      const champId = ctx.championSelections[puuid]
      const champAnalysis = champId ? champions[champId] : null
      advices.push({
        type: CoachAdviceType.ENEMY_WEAKNESS,
        priority: CoachAdvicePriority.HIGH,
        title: '对手近期状态不佳',
        message: champAnalysis
          ? `对方该英雄胜率${((champAnalysis.win / Math.max(champAnalysis.count, 1)) * 100).toFixed(0)}%（${champAnalysis.count}场），整体胜率${(summary.winRate * 100).toFixed(0)}%，可积极对线`
          : `对方近期胜率${(summary.winRate * 100).toFixed(0)}%（${summary.count}场），状态低迷，可主动打压`,
        evidence: ['winRate', 'championWinRate'],
        confidence: Math.min(summary.count / 15, 1.0) * 0.8,
        audience: 'self'
      })
    }

    if (summary.averageKda < 1.5 && summary.count >= 5) {
      advices.push({
        type: CoachAdviceType.ENEMY_WEAKNESS,
        priority: CoachAdvicePriority.MEDIUM,
        title: '对手容易被击杀',
        message: `对方近期KDA${summary.averageKda.toFixed(2)}，场均死亡较多，可配合打野重点照顾`,
        evidence: ['averageKda'],
        confidence: Math.min(summary.count / 10, 1.0) * 0.7,
        audience: 'team'
      })
    }

    if (summary.losingStreak >= 3) {
      advices.push({
        type: CoachAdviceType.MENTAL,
        priority: CoachAdvicePriority.LOW,
        title: '对手正在连败',
        message: `对方已连败${summary.losingStreak}场，心态可能不稳，前期施压可加速崩盘`,
        evidence: ['losingStreak'],
        confidence: 0.6,
        audience: 'team'
      })
    }
  }

  return finalizeStage(ctx, advices, { enemyWeaknessCompleted: true })
}

function stageTeamSynergy(ctx: PipelineStageContext): PipelineStageContext {
  const advices: CoachAdvice[] = []
  const allyStrengths: Record<string, string[]> = {}

  for (const puuid of ctx.allyPuuids) {
    const analysis = ctx.playerAnalyses[puuid]
    if (!analysis) continue
    const { summary } = analysis
    const strengths: string[] = []

    if (summary.averageDamageDealtToChampionShareToTop > 0.8) strengths.push('high_damage')
    if (summary.averageKillParticipationRate > 0.65) strengths.push('high_participation')
    if (summary.averageVisionScore > 1.5) strengths.push('good_vision')

    if (summary.winningStreak >= 3) {
      strengths.push('hot_streak')
      advices.push({
        type: CoachAdviceType.TEAM_SYNERGY,
        priority: CoachAdvicePriority.LOW,
        title: '队友状态火热',
        message: `队友${summary.winningStreak}连胜中，胜率${(summary.winRate * 100).toFixed(0)}%`,
        evidence: ['winningStreak', 'winRate'],
        confidence: 0.7,
        audience: 'self'
      })
    }

    if (summary.winRate < 0.35 && summary.count >= 5) {
      advices.push({
        type: CoachAdviceType.RISK_WARNING,
        priority: CoachAdvicePriority.MEDIUM,
        title: '队友近期表现需注意',
        message: `队友近期胜率${(summary.winRate * 100).toFixed(0)}%，可能需要更多支援`,
        evidence: ['winRate'],
        confidence: Math.min(summary.count / 10, 1.0) * 0.6,
        audience: 'self'
      })
    }

    allyStrengths[puuid] = strengths
  }

  return finalizeStage(ctx, advices, { allyStrengths, teamSynergyCompleted: true })
}

function stageMacroStrategy(ctx: PipelineStageContext): PipelineStageContext {
  const advices: CoachAdvice[] = []
  const allyPass = computeTeamScorePass(ctx.allyPuuids, ctx.playerAnalyses)
  const enemyPass = computeTeamScorePass(ctx.enemyPuuids, ctx.playerAnalyses)

  const allyAvg = allyPass.count > 0 ? allyPass.total / allyPass.count : 0
  const enemyAvg = enemyPass.count > 0 ? enemyPass.total / enemyPass.count : 0
  const diff = allyAvg - enemyAvg
  const baseConfidence = Math.min(Math.min(allyPass.count, enemyPass.count) / 4, 1.0) * 0.7

  if (diff > 3) {
    advices.push({
      type: CoachAdviceType.MACRO_STRATEGY,
      priority: CoachAdvicePriority.MEDIUM,
      title: '己方整体实力占优',
      message: '基于近期数据我方战力领先，建议主动推进节奏，多做团战和推塔，避免拖延被翻盘',
      evidence: ['akariScore_team_diff'],
      confidence: baseConfidence,
      audience: 'team'
    })
  } else if (diff < -3) {
    advices.push({
      type: CoachAdviceType.MACRO_STRATEGY,
      priority: CoachAdvicePriority.HIGH,
      title: '对手整体实力略强',
      message: '对方近期整体表现较好，建议稳扎稳打注意视野，避免冒险决战，寻找对方单人失误扩大优势',
      evidence: ['akariScore_team_diff'],
      confidence: baseConfidence,
      audience: 'team'
    })
  } else {
    advices.push({
      type: CoachAdviceType.MACRO_STRATEGY,
      priority: CoachAdvicePriority.LOW,
      title: '双方实力接近',
      message: '双方近期数据旗鼓相当，胜负关键在于执行力和团队配合',
      evidence: ['akariScore_balanced'],
      confidence: 0.5,
      audience: 'team'
    })
  }

  if (ctx.gameMode === 'ARAM' || ctx.queueType === 'ARAM') {
    advices.push({
      type: CoachAdviceType.MACRO_STRATEGY,
      priority: CoachAdvicePriority.LOW,
      title: 'ARAM策略',
      message: '注意团战站位，优先清兵确保经济，争夺生命值遗物，不要恋战导致人数劣势',
      evidence: ['gameMode_ARAM'],
      confidence: 0.8,
      audience: 'team'
    })
  }

  return finalizeStage(ctx, advices, {
    allyAvgScore: allyAvg,
    enemyAvgScore: enemyAvg,
    scoreDiff: diff,
    macroStrategyCompleted: true
  })
}

function stageSelfAnalysis(ctx: PipelineStageContext): PipelineStageContext {
  const advices: CoachAdvice[] = []
  const selfAnalysis = ctx.playerAnalyses[ctx.selfPuuid]
  if (!selfAnalysis) return ctx

  const { summary, champions } = selfAnalysis
  const selfChampId = ctx.championSelections[ctx.selfPuuid]

  if (selfChampId) {
    const champData = champions[selfChampId]
    if (champData && champData.count >= 3) {
      const wr = champData.win / champData.count
      if (wr > 0.65) {
        advices.push({
          type: CoachAdviceType.MENTAL,
          priority: CoachAdvicePriority.LOW,
          title: '你的拿手英雄',
          message: `该英雄${champData.count}场胜率${(wr * 100).toFixed(0)}%，发挥优势自信打`,
          evidence: ['championWinRate', 'championCount'],
          confidence: Math.min(champData.count / 8, 1.0) * 0.8,
          audience: 'self'
        })
      } else if (wr < 0.35) {
        advices.push({
          type: CoachAdviceType.RISK_WARNING,
          priority: CoachAdvicePriority.MEDIUM,
          title: '该英雄近期表现一般',
          message: `近期该英雄${champData.count}场胜率${(wr * 100).toFixed(0)}%，注意调整打法`,
          evidence: ['championWinRate', 'championCount'],
          confidence: Math.min(champData.count / 5, 1.0) * 0.7,
          audience: 'self'
        })
      }
    } else if (!champData) {
      advices.push({
        type: CoachAdviceType.RISK_WARNING,
        priority: CoachAdvicePriority.LOW,
        title: '近期未使用该英雄',
        message: '近期没有使用该英雄的记录，对线可以更稳一些',
        evidence: ['noRecentChampionData'],
        confidence: 0.5,
        audience: 'self'
      })
    }
  }

  if (summary.averageCsPerMinute < 5.5 && ctx.gameMode !== 'ARAM') {
    advices.push({
      type: CoachAdviceType.LANING_PHASE,
      priority: CoachAdvicePriority.MEDIUM,
      title: '关注补刀质量',
      message: `近期场均每分钟补兵${summary.averageCsPerMinute.toFixed(1)}，提高补刀可获得更多经济优势`,
      evidence: ['csPerMinute'],
      confidence: Math.min(summary.count / 8, 1.0) * 0.7,
      audience: 'self'
    })
  }

  if (summary.averageVisionScore < 0.7 && ctx.gameMode !== 'ARAM') {
    advices.push({
      type: CoachAdviceType.VISION,
      priority: CoachAdvicePriority.MEDIUM,
      title: '注意插眼',
      message: '近期视野评分偏低，购买控制守卫在关键位置插眼可有效避免被抓',
      evidence: ['visionScore'],
      confidence: 0.6,
      audience: 'self'
    })
  }

  if (summary.losingStreak >= 3) {
    advices.push({
      type: CoachAdviceType.MENTAL,
      priority: CoachAdvicePriority.HIGH,
      title: '调整心态',
      message: `已连败${summary.losingStreak}场，放平心态专注自己发挥`,
      evidence: ['losingStreak'],
      confidence: 0.8,
      audience: 'self'
    })
  } else if (summary.winningStreak >= 3) {
    advices.push({
      type: CoachAdviceType.MENTAL,
      priority: CoachAdvicePriority.INFO,
      title: '状态良好',
      message: `${summary.winningStreak}连胜中，保持状态继续发挥`,
      evidence: ['winningStreak'],
      confidence: 0.9,
      audience: 'self'
    })
  }

  return finalizeStage(ctx, advices, { selfAnalysisCompleted: true })
}

function stagePremadeDetection(ctx: PipelineStageContext): PipelineStageContext {
  const advices: CoachAdvice[] = []
  const inferredTeams = ctx.intermediates.inferredPremadeTeams as
    | Record<string, string[][]>
    | undefined
  if (!inferredTeams) return ctx

  for (const [, groups] of Object.entries(inferredTeams)) {
    const isEnemySide = groups.some((group) =>
      group.some((p) => ctx.enemyPuuids.includes(p))
    )
    if (!isEnemySide) continue

    for (const group of groups) {
      if (group.length >= 3) {
        advices.push({
          type: CoachAdviceType.RISK_WARNING,
          priority: CoachAdvicePriority.HIGH,
          title: '对方存在多人组队',
          message: `对方有${group.length}人预组队，配合可能更默契，避免孤军深入`,
          evidence: ['premadeTeam_enemy'],
          confidence: 0.75,
          audience: 'team'
        })
      } else if (group.length === 2) {
        advices.push({
          type: CoachAdviceType.RISK_WARNING,
          priority: CoachAdvicePriority.LOW,
          title: '对方有双排组合',
          message: '对方存在双排，注意观察他们的联动',
          evidence: ['premadeTeam_duo'],
          confidence: 0.6,
          audience: 'team'
        })
      }
    }
  }

  return finalizeStage(ctx, advices, { premadeDetectionCompleted: true })
}

// Sequential pipeline scheduler. Modeled after Megatron-LM's
// get_forward_backward_func (pipeline_parallel/schedules.py:47).
export class CoachPipeline {
  private _stages: { name: string; handler: PipelineStageHandler }[] = []

  addStage(name: string, handler: PipelineStageHandler) {
    this._stages.push({ name, handler })
  }

  execute(initialCtx: PipelineStageContext): PipelineStageContext {
    let ctx = initialCtx
    for (const stage of this._stages) {
      ctx = { ...ctx, stage: stage.name }
      try {
        ctx = stage.handler(ctx)
      } catch (error) {
        console.warn(`Coach pipeline stage "${stage.name}" failed:`, error)
      }
    }
    return ctx
  }
}

export class CoachEngine {
  private _pipeline: CoachPipeline
  private _cache: Map<string, { advices: CoachAdvice[]; timestamp: number }> = new Map()
  private _cacheMaxAge = 60_000

  constructor() {
    this._pipeline = new CoachPipeline()
    this._pipeline.addStage('enemy_weakness', stageEnemyWeakness)
    this._pipeline.addStage('team_synergy', stageTeamSynergy)
    this._pipeline.addStage('macro_strategy', stageMacroStrategy)
    this._pipeline.addStage('self_analysis', stageSelfAnalysis)
    this._pipeline.addStage('premade_detection', stagePremadeDetection)
  }

  generateAdvices(params: {
    playerStats: {
      players: Record<string, MatchHistoryGamesAnalysisAll>
      teams: Record<string, any>
    } | null
    championSelections: Record<string, number>
    positionAssignments: Record<string, { position: string; role: any }>
    rankedStats: Record<string, { data: RankedStats }>
    selfPuuid: string
    allyMembers: string[]
    enemyMembers: string[]
    gameMode: string
    queueType: string
    inferredPremadeTeams?: Record<string, string[][]>
  }): CoachAdvice[] {
    if (!params.playerStats) return []

    const cacheKey = this._computeCacheKey(params)
    const cached = this._cache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < this._cacheMaxAge) {
      return cached.advices
    }

    const ctx: PipelineStageContext = {
      stage: 'init',
      advices: [],
      intermediates: { inferredPremadeTeams: params.inferredPremadeTeams || {} },
      playerAnalyses: params.playerStats.players,
      teamAnalyses: params.playerStats.teams,
      championSelections: params.championSelections,
      positionAssignments: params.positionAssignments,
      rankedStats: params.rankedStats,
      selfPuuid: params.selfPuuid,
      allyPuuids: params.allyMembers.filter((p) => p !== params.selfPuuid),
      enemyPuuids: params.enemyMembers,
      gameMode: params.gameMode,
      queueType: params.queueType
    }

    const result = this._pipeline.execute(ctx)
    const sorted = result.advices.sort((a, b) => a.priority - b.priority)
    const deduped = this._deduplicateAdvices(sorted)
    this._cache.set(cacheKey, { advices: deduped, timestamp: Date.now() })
    return deduped
  }

  formatAsMessages(
    advices: CoachAdvice[],
    options: {
      maxLines?: number
      audience?: 'self' | 'ally' | 'team'
      minPriority?: CoachAdvicePriority
    } = {}
  ): string[] {
    const { maxLines = 8, audience, minPriority = CoachAdvicePriority.INFO } = options
    let filtered = advices.filter((a) => a.priority <= minPriority)
    if (audience) {
      filtered = filtered.filter((a) => a.audience === audience || a.audience === 'team')
    }
    return filtered.slice(0, maxLines).map((advice) => {
      const tag =
        advice.priority <= CoachAdvicePriority.HIGH
          ? '❗'
          : advice.priority === CoachAdvicePriority.MEDIUM
            ? '📋'
            : 'ℹ️'
      return `${tag} [${advice.title}] ${advice.message}`
    })
  }

  clearCache() {
    this._cache.clear()
  }

  private _computeCacheKey(params: any): string {
    const champStr = Object.entries(params.championSelections)
      .sort()
      .map(([k, v]) => `${k}:${v}`)
      .join(',')
    return `${params.selfPuuid}|${champStr}|${params.gameMode}`
  }

  private _deduplicateAdvices(advices: CoachAdvice[]): CoachAdvice[] {
    const seen = new Map<string, CoachAdvice>()
    for (const advice of advices) {
      const key = `${advice.type}:${advice.priority}`
      const existing = seen.get(key)
      if (!existing || advice.confidence > existing.confidence) {
        seen.set(key, advice)
      }
    }
    return Array.from(seen.values())
  }
}

export function createCoachEngine(): CoachEngine {
  return new CoachEngine()
}
