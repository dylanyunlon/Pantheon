
import {
  MatchHistoryGamesAnalysisAll,
  MatchHistoryGamesAnalysisTeamSide,
  MatchHistoryChampionAnalysis,
  AkariScore,
  calculateAkariScore
} from './analysis'
import { RankedStats } from '@shared/types/league-client/ranked'
import type { ParsedRole } from './ranked'
import {
  PantheonCacheLayers,
  PantheonRefCounts,
  canonicalizeCacheKey,
  computeDataCompleteness,
  shouldReplace
} from './cache'
import type { PantheonCacheKeyParams } from './cache'
import {
  aggregateTeamProfile,
  compareTeams,
  RingReducer,
  BatchAggregationContext
} from './cache/aggregator'
import type { TeamComparisonResult, AggregatedTeamProfile } from './cache/aggregator'
import {
  PantheonScheduler,
  createPantheonScheduler,
  mapQueryPhaseToGamePhase
} from './scheduler'
import type { GamePhase, ScheduledAdvice, SchedulerConfig } from './scheduler'
import {
  ExperimentCapture,
  createExperimentCapture
} from './capture'
import type { FeatureVector, TrainingSample, CaptureSessionMeta } from './capture'
import {
  PantheonInferenceEngine,
  createInferenceEngine
} from './inference'
import type { InferenceResult, InferenceConfig, InferenceBackend, OnnxSessionFactory } from './inference'
import {
  ExperimentManager,
  createExperimentManager
} from './abtest'
import type { ExperimentDefinition, ExperimentSnapshot, SessionAssignment, ComparisonResult } from './abtest'
import {
  PantheonObservableStore,
  createObservableStore
} from './observable-adapter'
import type { ObservableStatus, SubjectListener } from './observable-adapter'
import {
  ReplayAnalysisPipeline,
  createReplayAnalysisPipeline
} from './replay'
import type { ReplayAnalysisReport } from './replay'
import {
  PantheonStreamServer,
  createStreamServer
} from './streaming'
import type { StreamServerConfig } from './streaming'
import {
  DecisionCoordinator,
  createDecisionCoordinator
} from './decision'
import type { FusedAdvice, CoordinatorConfig } from './decision'
import { runProfilePass } from './profiling'
import type { ProfileSnapshot } from './profiling'
import {
  LiveIngestor,
  createLiveIngestor,
  MetaIngestor,
  createMetaIngestor
} from '../../ontology/ingestion'
import type {
  LiveIngestorStats,
  LiveIngestorSession,
  LiveGameEvent,
  GameSnapshot,
  LiveEventType,
  LiveEventListener,
  SnapshotListener,
  MetaIngestorStats as MetaIngestorStatsType,
  ChampionMetaWithBalance,
  ChampionMetaListener
} from '../../ontology/ingestion'
import {
  ObjectStore,
  createObjectStore,
  ObjectSet,
  createObjectSet
} from '../../ontology/store'
import type {
  ObjectStoreStats,
  OntologyObjectType,
  OntologyLinkType,
  ObjectListener,
  TypeListener,
  GlobalChangeListener,
  WhereClause,
  AggregationClause,
  AggregationResult,
  FetchPageResult
} from '../../ontology/store'
import {
  PipelineRegistry,
  createPipelineRegistry,
  createTransformPipeline,
  createOntologyWriter
} from '../../ontology/pipeline'
import type {
  TransformPipeline,
  PipelineDescriptor,
  PipelineResult,
  StageMetrics,
  OntologyWriterStage
} from '../../ontology/pipeline'

export const enum PantheonAdvicePriority {
  CRITICAL = 0,
  HIGH = 1,
  MEDIUM = 2,
  LOW = 3,
  INFO = 4
}

export const enum PantheonAdviceType {
  LANING_PHASE = 'laning_phase',
  ITEMIZATION = 'itemization',
  TEAMFIGHT = 'teamfight',
  OBJECTIVE = 'objective',
  VISION = 'vision',
  ENEMY_WEAKNESS = 'enemy_weakness',
  TEAM_SYNERGY = 'team_synergy',
  RISK_WARNING = 'risk_warning',
  MACRO_STRATEGY = 'macro_strategy',
  MENTAL = 'mental',
  LANE_MATCHUP = 'lane_matchup',
  RANK_DISPARITY = 'rank_disparity',
  COMPOSITION = 'composition',
  ITEMIZATION_HINT = 'itemization_hint',
  OBJECTIVE_TIMING = 'objective_timing',
  PLAYSTYLE_ADAPTATION = 'playstyle_adaptation',
  GOLD_EFFICIENCY = 'gold_efficiency',
  TRUE_DAMAGE_WARNING = 'true_damage_warning',
  CHERRY_STRATEGY = 'cherry_strategy',
  WIN_CONDITION = 'win_condition',
  KDA_TREND = 'kda_trend'
}

export interface PantheonAdvice {
  type: PantheonAdviceType
  priority: PantheonAdvicePriority
  title: string
  message: string
  evidence: string[]
  confidence: number
  audience: 'self' | 'ally' | 'team'
}

export interface PipelineStageContext {
  stage: string
  advices: PantheonAdvice[]
  intermediates: Record<string, unknown>
  playerAnalyses: Record<string, MatchHistoryGamesAnalysisAll>
  teamAnalyses: Record<string, MatchHistoryGamesAnalysisTeamSide>
  championSelections: Record<string, number>
  positionAssignments: Record<string, { position: string; role: ParsedRole | null }>
  rankedStats: Record<string, { data: RankedStats }>
  selfPuuid: string
  allyPuuids: string[]
  enemyPuuids: string[]
  gameMode: string
  queueType: string
  teamComparison: TeamComparisonResult | null
  allyProfile: AggregatedTeamProfile | null
  enemyProfile: AggregatedTeamProfile | null
  currentGamePhase: GamePhase
  profile: ProfileSnapshot | null
}

type PipelineStageHandler = (ctx: PipelineStageContext) => PipelineStageContext

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

const TIER_ORDER: Record<string, number> = {
  IRON: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4,
  EMERALD: 5, DIAMOND: 6, MASTER: 7, GRANDMASTER: 8, CHALLENGER: 9
}
const DIVISION_ORDER: Record<string, number> = { IV: 0, III: 1, II: 2, I: 3 }

function rankToNumeric(tier: string, division: string): number {
  const t = TIER_ORDER[tier] ?? -1
  if (t < 0) return -1
  return t * 4 + (DIVISION_ORDER[division] ?? 0)
}

function getRankNumeric(
  rankedStats: Record<string, { data: RankedStats }>,
  puuid: string
): number {
  const entry = rankedStats[puuid]
  if (!entry?.data?.queueMap?.RANKED_SOLO_5x5) return -1
  const solo = entry.data.queueMap.RANKED_SOLO_5x5
  if (!solo.tier || solo.tier === 'UNRANKED' || solo.tier === '') return -1
  return rankToNumeric(solo.tier, solo.division)
}

function getRankLabel(
  rankedStats: Record<string, { data: RankedStats }>,
  puuid: string
): string {
  const entry = rankedStats[puuid]
  if (!entry?.data?.queueMap?.RANKED_SOLO_5x5) return '未定级'
  const solo = entry.data.queueMap.RANKED_SOLO_5x5
  if (!solo.tier || solo.tier === 'UNRANKED' || solo.tier === '') return '未定级'
  const tierCN: Record<string, string> = {
    IRON: '黑铁', BRONZE: '青铜', SILVER: '白银', GOLD: '黄金',
    PLATINUM: '铂金', EMERALD: '翡翠', DIAMOND: '钻石',
    MASTER: '大师', GRANDMASTER: '宗师', CHALLENGER: '王者'
  }
  return `${tierCN[solo.tier] || solo.tier}${solo.division}`
}

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

function finalizeStage(
  ctx: PipelineStageContext,
  newAdvices: PantheonAdvice[],
  intermediateUpdates: Record<string, unknown>
): PipelineStageContext {
  return {
    ...ctx,
    advices: [...ctx.advices, ...newAdvices],
    intermediates: { ...ctx.intermediates, ...intermediateUpdates }
  }
}
function stageEnemyWeakness(ctx: PipelineStageContext): PipelineStageContext {
  const advices: PantheonAdvice[] = []

  for (const puuid of ctx.enemyPuuids) {
    const analysis = ctx.playerAnalyses[puuid]
    if (!analysis) continue
    const { summary, champions } = analysis

    if (summary.winRate < 0.4 && summary.count >= 5) {
      const champId = ctx.championSelections[puuid]
      const champAnalysis = champId ? champions[champId] : null
      advices.push({
        type: PantheonAdviceType.ENEMY_WEAKNESS,
        priority: PantheonAdvicePriority.HIGH,
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
        type: PantheonAdviceType.ENEMY_WEAKNESS,
        priority: PantheonAdvicePriority.MEDIUM,
        title: '对手容易被击杀',
        message: `对方近期KDA${summary.averageKda.toFixed(2)}，场均死亡较多，可配合打野重点照顾`,
        evidence: ['averageKda'],
        confidence: Math.min(summary.count / 10, 1.0) * 0.7,
        audience: 'team'
      })
    }

    if (summary.losingStreak >= 3) {
      advices.push({
        type: PantheonAdviceType.MENTAL,
        priority: PantheonAdvicePriority.LOW,
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
  const advices: PantheonAdvice[] = []
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
        type: PantheonAdviceType.TEAM_SYNERGY,
        priority: PantheonAdvicePriority.LOW,
        title: '队友状态火热',
        message: `队友${summary.winningStreak}连胜中，胜率${(summary.winRate * 100).toFixed(0)}%`,
        evidence: ['winningStreak', 'winRate'],
        confidence: 0.7,
        audience: 'self'
      })
    }

    if (summary.winRate < 0.35 && summary.count >= 5) {
      advices.push({
        type: PantheonAdviceType.RISK_WARNING,
        priority: PantheonAdvicePriority.MEDIUM,
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
  const advices: PantheonAdvice[] = []

  const allyAvg = ctx.profile?.allyAvgScore ?? 0
  const enemyAvg = ctx.profile?.enemyAvgScore ?? 0
  const diff = ctx.profile?.scoreDiff ?? (allyAvg - enemyAvg)
  const sampleCount = ctx.profile
    ? Math.min(ctx.profile.allyScores.length, ctx.profile.enemyScores.length)
    : 0
  const baseConfidence = Math.min(sampleCount / 4, 1.0) * 0.7

  if (diff > 3) {
    advices.push({
      type: PantheonAdviceType.MACRO_STRATEGY,
      priority: PantheonAdvicePriority.MEDIUM,
      title: '己方整体实力占优',
      message: '基于近期数据我方战力领先，建议主动推进节奏，多做团战和推塔，避免拖延被翻盘',
      evidence: ['akariScore_team_diff'],
      confidence: baseConfidence,
      audience: 'team'
    })
  } else if (diff < -3) {
    advices.push({
      type: PantheonAdviceType.MACRO_STRATEGY,
      priority: PantheonAdvicePriority.HIGH,
      title: '对手整体实力略强',
      message: '对方近期整体表现较好，建议稳扎稳打注意视野，避免冒险决战，寻找对方单人失误扩大优势',
      evidence: ['akariScore_team_diff'],
      confidence: baseConfidence,
      audience: 'team'
    })
  } else {
    advices.push({
      type: PantheonAdviceType.MACRO_STRATEGY,
      priority: PantheonAdvicePriority.LOW,
      title: '双方实力接近',
      message: '双方近期数据旗鼓相当，胜负关键在于执行力和团队配合',
      evidence: ['akariScore_balanced'],
      confidence: 0.5,
      audience: 'team'
    })
  }

  if (ctx.gameMode === 'ARAM' || ctx.queueType === 'ARAM') {
    advices.push({
      type: PantheonAdviceType.MACRO_STRATEGY,
      priority: PantheonAdvicePriority.LOW,
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
    allyPerPlayer: allyPass.perPlayer,
    enemyPerPlayer: enemyPass.perPlayer,
    macroStrategyCompleted: true
  })
}

function stageSelfAnalysis(ctx: PipelineStageContext): PipelineStageContext {
  const advices: PantheonAdvice[] = []
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
          type: PantheonAdviceType.MENTAL,
          priority: PantheonAdvicePriority.LOW,
          title: '你的拿手英雄',
          message: `该英雄${champData.count}场胜率${(wr * 100).toFixed(0)}%，发挥优势自信打`,
          evidence: ['championWinRate', 'championCount'],
          confidence: Math.min(champData.count / 8, 1.0) * 0.8,
          audience: 'self'
        })
      } else if (wr < 0.35) {
        advices.push({
          type: PantheonAdviceType.RISK_WARNING,
          priority: PantheonAdvicePriority.MEDIUM,
          title: '该英雄近期表现一般',
          message: `近期该英雄${champData.count}场胜率${(wr * 100).toFixed(0)}%，注意调整打法`,
          evidence: ['championWinRate', 'championCount'],
          confidence: Math.min(champData.count / 5, 1.0) * 0.7,
          audience: 'self'
        })
      }
    } else if (!champData) {
      advices.push({
        type: PantheonAdviceType.RISK_WARNING,
        priority: PantheonAdvicePriority.LOW,
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
      type: PantheonAdviceType.LANING_PHASE,
      priority: PantheonAdvicePriority.MEDIUM,
      title: '关注补刀质量',
      message: `近期场均每分钟补兵${summary.averageCsPerMinute.toFixed(1)}，提高补刀可获得更多经济优势`,
      evidence: ['csPerMinute'],
      confidence: Math.min(summary.count / 8, 1.0) * 0.7,
      audience: 'self'
    })
  }

  if (summary.averageVisionScore < 0.7 && ctx.gameMode !== 'ARAM') {
    advices.push({
      type: PantheonAdviceType.VISION,
      priority: PantheonAdvicePriority.MEDIUM,
      title: '注意插眼',
      message: '近期视野评分偏低，购买控制守卫在关键位置插眼可有效避免被抓',
      evidence: ['visionScore'],
      confidence: 0.6,
      audience: 'self'
    })
  }

  if (summary.losingStreak >= 3) {
    advices.push({
      type: PantheonAdviceType.MENTAL,
      priority: PantheonAdvicePriority.HIGH,
      title: '调整心态',
      message: `已连败${summary.losingStreak}场，放平心态专注自己发挥`,
      evidence: ['losingStreak'],
      confidence: 0.8,
      audience: 'self'
    })
  } else if (summary.winningStreak >= 3) {
    advices.push({
      type: PantheonAdviceType.MENTAL,
      priority: PantheonAdvicePriority.INFO,
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
  const advices: PantheonAdvice[] = []
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
          type: PantheonAdviceType.RISK_WARNING,
          priority: PantheonAdvicePriority.HIGH,
          title: '对方存在多人组队',
          message: `对方有${group.length}人预组队，配合可能更默契，避免孤军深入`,
          evidence: ['premadeTeam_enemy'],
          confidence: 0.75,
          audience: 'team'
        })
      } else if (group.length === 2) {
        advices.push({
          type: PantheonAdviceType.RISK_WARNING,
          priority: PantheonAdvicePriority.LOW,
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

function stageRankDisparity(ctx: PipelineStageContext): PipelineStageContext {
  if (ctx.gameMode === 'ARAM') return ctx
  const advices: PantheonAdvice[] = []

  const selfRank = ctx.profile?.selfRank.numeric ?? -1
  const highestEnemy = ctx.profile?.highestEnemyRank ?? null

  if (selfRank >= 0 && highestEnemy && highestEnemy.numeric >= 0) {
    const gap = highestEnemy.numeric - selfRank
    if (gap >= 8) {
      advices.push({
        type: PantheonAdviceType.RANK_DISPARITY,
        priority: PantheonAdvicePriority.HIGH,
        title: '对方有高段位玩家',
        message: `对方有${highestEnemy.label}段位玩家，注意避免正面硬刚，利用团队配合`,
        evidence: ['rankNumeric_gap'],
        confidence: 0.85,
        audience: 'team'
      })
    } else if (gap <= -8) {
      advices.push({
        type: PantheonAdviceType.RANK_DISPARITY,
        priority: PantheonAdvicePriority.LOW,
        title: '段位优势',
        message: '我方段位整体占优，自信发挥但不要轻敌',
        evidence: ['rankNumeric_advantage'],
        confidence: 0.7,
        audience: 'self'
      })
    }
  }

  const lane = ctx.profile?.laneMatchup
  if (lane && selfRank >= 0) {
    if (lane.laneRankGap >= 6) {
      advices.push({
        type: PantheonAdviceType.LANE_MATCHUP,
        priority: PantheonAdvicePriority.HIGH,
        title: '对线对手段位较高',
        message: `你的对线是${lane.enemyRank.label}，对线可以更谨慎，优先保证不亏`,
        evidence: ['laneRankGap'],
        confidence: 0.8,
        audience: 'self'
      })
    } else if (lane.laneRankGap <= -6) {
      advices.push({
        type: PantheonAdviceType.LANE_MATCHUP,
        priority: PantheonAdvicePriority.LOW,
        title: '对线段位优势',
        message: `对线对手段位较低（${lane.enemyRank.label}），可以积极打出优势`,
        evidence: ['laneRankAdvantage'],
        confidence: 0.75,
        audience: 'self'
      })
    }
  }

  return finalizeStage(ctx, advices, { rankDisparityCompleted: true })
}

function stageLaneMatchup(ctx: PipelineStageContext): PipelineStageContext {
  if (ctx.gameMode === 'ARAM') return ctx
  const advices: PantheonAdvice[] = []

  const selfPos = ctx.positionAssignments[ctx.selfPuuid]?.position
  if (!selfPos) return finalizeStage(ctx, advices, { laneMatchupCompleted: true })

  let enemyLanerPuuid: string | null = null
  for (const puuid of ctx.enemyPuuids) {
    if (ctx.positionAssignments[puuid]?.position === selfPos) {
      enemyLanerPuuid = puuid
      break
    }
  }

  if (!enemyLanerPuuid) {
    return finalizeStage(ctx, advices, { laneMatchupCompleted: true })
  }

  const enemyAnalysis = ctx.playerAnalyses[enemyLanerPuuid]
  const selfAnalysis = ctx.playerAnalyses[ctx.selfPuuid]
  if (!enemyAnalysis || !selfAnalysis) {
    return finalizeStage(ctx, advices, { laneMatchupCompleted: true })
  }

  const enemyChampId = ctx.championSelections[enemyLanerPuuid]
  const selfChampId = ctx.championSelections[ctx.selfPuuid]

  if (enemyChampId) {
    const enemyChampData = enemyAnalysis.champions[enemyChampId]
    if (enemyChampData && enemyChampData.count >= 5) {
      const wr = enemyChampData.win / enemyChampData.count
      if (wr > 0.65) {
        advices.push({
          type: PantheonAdviceType.LANE_MATCHUP,
          priority: PantheonAdvicePriority.HIGH,
          title: '对线对手英雄熟练度高',
          message: `对方该英雄${enemyChampData.count}场胜率${(wr * 100).toFixed(0)}%，是其拿手英雄，对线需谨慎`,
          evidence: ['enemyChampionMastery'],
          confidence: Math.min(enemyChampData.count / 10, 1.0) * 0.8,
          audience: 'self'
        })
      } else if (wr < 0.35) {
        advices.push({
          type: PantheonAdviceType.LANE_MATCHUP,
          priority: PantheonAdvicePriority.MEDIUM,
          title: '对线对手该英雄胜率低',
          message: `对方该英雄近期${enemyChampData.count}场胜率仅${(wr * 100).toFixed(0)}%，可寻找机会建立优势`,
          evidence: ['enemyChampionWeakness'],
          confidence: Math.min(enemyChampData.count / 8, 1.0) * 0.7,
          audience: 'self'
        })
      }
    } else if (!enemyChampData) {
      advices.push({
        type: PantheonAdviceType.LANE_MATCHUP,
        priority: PantheonAdvicePriority.MEDIUM,
        title: '对线对手近期未用该英雄',
        message: '对方近期没有使用该英雄的记录，可能不够熟练，可考虑主动压制',
        evidence: ['enemyNoRecentChampData'],
        confidence: 0.55,
        audience: 'self'
      })
    }
  }

  if (selfPos !== 'JUNGLE') {
    const selfCsPM = selfAnalysis.summary.averageCsPerMinute
    const enemyCsPM = enemyAnalysis.summary.averageCsPerMinute
    if (enemyCsPM > 0 && selfCsPM > 0) {
      const csRatio = selfCsPM / enemyCsPM
      if (csRatio < 0.75) {
        advices.push({
          type: PantheonAdviceType.LANING_PHASE,
          priority: PantheonAdvicePriority.MEDIUM,
          title: '对线对手补刀能力较强',
          message: `对方场均每分钟补兵${enemyCsPM.toFixed(1)}，高于你的${selfCsPM.toFixed(1)}，注意补刀不要落后太多`,
          evidence: ['csPerMinute_lane_comparison'],
          confidence: 0.65,
          audience: 'self'
        })
      }
    }
  }

  return finalizeStage(ctx, advices, {
    laneMatchupCompleted: true,
    selfLanePosition: selfPos,
    enemyLanerPuuid
  })
}

function stageComposition(ctx: PipelineStageContext): PipelineStageContext {
  if (ctx.gameMode === 'ARAM') return ctx
  const advices: PantheonAdvice[] = []

  const dmg = ctx.profile?.allyDamageProfile
  const allyCount = dmg?.sampleCount ?? 0

  if (dmg && allyCount >= 3) {
    const avgPhys = dmg.physicalShare
    const avgMagic = dmg.magicalShare

    if (avgPhys > 0.7 && avgMagic < 0.2) {
      advices.push({
        type: PantheonAdviceType.COMPOSITION,
        priority: PantheonAdvicePriority.MEDIUM,
        title: '阵容物理伤害占比过高',
        message: '我方阵容以物理伤害为主，对方可能出护甲装堆叠，中后期需注意穿透装备',
        evidence: ['teamPhysicalDamageShare'],
        confidence: 0.65,
        audience: 'team'
      })
    } else if (avgMagic > 0.7 && avgPhys < 0.2) {
      advices.push({
        type: PantheonAdviceType.COMPOSITION,
        priority: PantheonAdvicePriority.MEDIUM,
        title: '阵容魔法伤害占比过高',
        message: '我方阵容以魔法伤害为主，对方可能出魔抗装堆叠，注意法术穿透',
        evidence: ['teamMagicDamageShare'],
        confidence: 0.65,
        audience: 'team'
      })
    }

    const allAlly = [ctx.selfPuuid, ...ctx.allyPuuids]
    const maxTankShare = Math.max(
      ...allAlly
        .map((p) => ctx.playerAnalyses[p]?.summary.averageDamageTakenShareOfTeam ?? 0)
    )
    if (maxTankShare < 0.25 && allyCount >= 4) {
      advices.push({
        type: PantheonAdviceType.COMPOSITION,
        priority: PantheonAdvicePriority.LOW,
        title: '阵容缺少前排',
        message: '我方近期数据显示缺少承伤能力，团战注意站位，避免被秒',
        evidence: ['teamTankDeficiency'],
        confidence: 0.5,
        audience: 'team'
      })
    }
  }

  return finalizeStage(ctx, advices, { compositionCompleted: true })
}

function stageItemization(ctx: PipelineStageContext): PipelineStageContext {
  if (ctx.gameMode === 'ARAM') return ctx
  const advices: PantheonAdvice[] = []
  const comparison = ctx.teamComparison

  if (comparison && comparison.confidence > 0.3) {
    const damageDelta = comparison.dimensionDeltas.damage
    const tankDelta = comparison.dimensionDeltas.tankiness

    if (damageDelta < -0.1 && tankDelta > 0.05) {
      advices.push({
        type: PantheonAdviceType.ITEMIZATION_HINT,
        priority: PantheonAdvicePriority.MEDIUM,
        title: '输出装备优先',
        message: '我方坦度足够但输出不足，前排可适当出输出装加速团战节奏',
        evidence: ['damageDelta', 'tankDelta', 'teamComparison'],
        confidence: comparison.confidence * 0.6,
        audience: 'team'
      })
    }

    if (comparison.enemyProfile && comparison.enemyProfile.avgDamageShare > 0.75) {
      advices.push({
        type: PantheonAdviceType.ITEMIZATION_HINT,
        priority: PantheonAdvicePriority.MEDIUM,
        title: '对方输出集中',
        message: '对方队伍输出集中度高，可考虑出针对性防御装备降低其团战影响',
        evidence: ['enemyDamageConcentration', 'teamComparison'],
        confidence: comparison.confidence * 0.7,
        audience: 'team'
      })
    }

    if (comparison.allyProfile && comparison.allyProfile.avgTankinessShare < 0.2) {
      advices.push({
        type: PantheonAdviceType.ITEMIZATION_HINT,
        priority: PantheonAdvicePriority.MEDIUM,
        title: '防御装备不足',
        message: '我方整体坦度偏低，输出位可考虑出一件防御装保证团战生存能力',
        evidence: ['allyTankinessDeficit'],
        confidence: comparison.confidence * 0.65,
        audience: 'team'
      })
    }

    if (comparison.allyProfile && comparison.enemyProfile) {
      const allyVision = comparison.allyProfile.avgVisionScore
      const enemyVision = comparison.enemyProfile.avgVisionScore
      if (enemyVision > 0 && allyVision / enemyVision < 0.6) {
        advices.push({
          type: PantheonAdviceType.ITEMIZATION_HINT,
          priority: PantheonAdvicePriority.LOW,
          title: '视野投入不足',
          message: '对方视野投入明显高于我方，增加控制守卫购买量可有效减少被抓风险',
          evidence: ['visionDeficit', 'teamComparison'],
          confidence: comparison.confidence * 0.6,
          audience: 'team'
        })
      }
    }
  }

  return finalizeStage(ctx, advices, { itemizationCompleted: true })
}

function stageObjectiveTiming(ctx: PipelineStageContext): PipelineStageContext {
  if (ctx.gameMode === 'ARAM') return ctx
  const advices: PantheonAdvice[] = []
  const comparison = ctx.teamComparison

  if (comparison && comparison.confidence > 0.3) {
    if (comparison.overallDelta > 0.05) {
      advices.push({
        type: PantheonAdviceType.OBJECTIVE_TIMING,
        priority: PantheonAdvicePriority.MEDIUM,
        title: '主动争夺目标',
        message: '我方整体数据占优，建议主动控制龙坑和峡谷先锋资源，扩大视野后开团',
        evidence: ['teamAdvantage', 'overallDelta'],
        confidence: comparison.confidence * 0.75,
        audience: 'team'
      })
    } else if (comparison.overallDelta < -0.05) {
      advices.push({
        type: PantheonAdviceType.OBJECTIVE_TIMING,
        priority: PantheonAdvicePriority.MEDIUM,
        title: '谨慎争夺目标',
        message: '对方整体数据略优，争夺大龙小龙时注意先确保人数和视野优势再开',
        evidence: ['teamDisadvantage', 'overallDelta'],
        confidence: comparison.confidence * 0.7,
        audience: 'team'
      })
    }
  }

  const selfAnalysis = ctx.playerAnalyses[ctx.selfPuuid]
  if (selfAnalysis) {
    const selfPos = ctx.positionAssignments[ctx.selfPuuid]?.position
    if (selfPos === 'JUNGLE') {
      if (selfAnalysis.summary.averageKillParticipationRate < 0.5 && selfAnalysis.summary.count >= 5) {
        advices.push({
          type: PantheonAdviceType.OBJECTIVE_TIMING,
          priority: PantheonAdvicePriority.MEDIUM,
          title: '增加参团频率',
          message: `近期参团率${(selfAnalysis.summary.averageKillParticipationRate * 100).toFixed(0)}%偏低，作为打野需更多参与关键团战和目标争夺`,
          evidence: ['junglerParticipation'],
          confidence: Math.min(selfAnalysis.summary.count / 10, 1.0) * 0.7,
          audience: 'self'
        })
      }
    }
  }

  return finalizeStage(ctx, advices, { objectiveTimingCompleted: true })
}

function stagePlaystyleAdaptation(ctx: PipelineStageContext): PipelineStageContext {
  const advices: PantheonAdvice[] = []
  const selfAnalysis = ctx.playerAnalyses[ctx.selfPuuid]
  if (!selfAnalysis) return ctx

  const { summary } = selfAnalysis
  const comparison = ctx.teamComparison

  if (summary.count >= 5) {
    const avgKda = summary.averageKda
    const avgDamageShare = summary.averageDamageDealtToChampionShareToTop
    const avgCsPM = summary.averageCsPerMinute
    const isHighDamage = avgDamageShare > 0.8
    const isLowDeath = avgKda > 4.0
    const isHighCs = avgCsPM > 7.5

    if (isHighDamage && !isLowDeath) {
      advices.push({
        type: PantheonAdviceType.PLAYSTYLE_ADAPTATION,
        priority: PantheonAdvicePriority.LOW,
        title: '高输出但风险偏高',
        message: '你的伤害占比高但KDA偏低，可适当减少冒险换血，在确保生存的前提下输出',
        evidence: ['highDamage', 'lowSurvival'],
        confidence: 0.65,
        audience: 'self'
      })
    }

    if (isHighCs && avgDamageShare < 0.5 && ctx.gameMode !== 'ARAM') {
      advices.push({
        type: PantheonAdviceType.PLAYSTYLE_ADAPTATION,
        priority: PantheonAdvicePriority.LOW,
        title: '经济转化率可提升',
        message: '你的补刀不错但伤害占比偏低，可以在团战中更积极地输出来转化经济优势',
        evidence: ['highCs', 'lowDamageConversion'],
        confidence: 0.6,
        audience: 'self'
      })
    }

    if (comparison && comparison.confidence > 0.3) {
      const goldDelta = comparison.dimensionDeltas.gold
      const damageDelta = comparison.dimensionDeltas.damage
      if (goldDelta > 0.05 && damageDelta < -0.03) {
        advices.push({
          type: PantheonAdviceType.PLAYSTYLE_ADAPTATION,
          priority: PantheonAdvicePriority.MEDIUM,
          title: '经济领先需转化优势',
          message: '我方经济水平高于对面但伤害转化不足，装备领先时更果断地发起进攻',
          evidence: ['goldAdvantage', 'damageDeficit', 'teamComparison'],
          confidence: comparison.confidence * 0.7,
          audience: 'team'
        })
      }
    }
  }

  return finalizeStage(ctx, advices, { playstyleAdaptationCompleted: true })
}
function stageGoldEfficiency(ctx: PipelineStageContext): PipelineStageContext {
  if (ctx.gameMode === 'ARAM') return ctx
  const advices: PantheonAdvice[] = []
  const selfAnalysis = ctx.playerAnalyses[ctx.selfPuuid]
  if (!selfAnalysis) return ctx

  const goldEff = selfAnalysis.summary.averageDamageGoldEfficiency
  if (goldEff < 0.6 && selfAnalysis.summary.count >= 5) {
    advices.push({
      type: PantheonAdviceType.GOLD_EFFICIENCY,
      priority: PantheonAdvicePriority.MEDIUM,
      title: '经济转化效率偏低',
      message: `近期经济转化率${(goldEff * 100).toFixed(0)}%，注意合理购买装备，减少无效投资`,
      evidence: ['averageDamageGoldEfficiency'],
      confidence: Math.min(selfAnalysis.summary.count / 10, 1.0) * 0.7,
      audience: 'self'
    })
  } else if (goldEff > 1.2 && selfAnalysis.summary.count >= 5) {
    advices.push({
      type: PantheonAdviceType.GOLD_EFFICIENCY,
      priority: PantheonAdvicePriority.INFO,
      title: '经济利用率高',
      message: '你的金币转化伤害效率优秀，继续保持装备选择',
      evidence: ['averageDamageGoldEfficiency'],
      confidence: Math.min(selfAnalysis.summary.count / 8, 1.0) * 0.6,
      audience: 'self'
    })
  }

  for (const puuid of ctx.enemyPuuids) {
    const analysis = ctx.playerAnalyses[puuid]
    if (!analysis) continue
    if (analysis.summary.averageDamageGoldEfficiency > 1.3 && analysis.summary.count >= 5) {
      const champId = ctx.championSelections[puuid]
      advices.push({
        type: PantheonAdviceType.GOLD_EFFICIENCY,
        priority: PantheonAdvicePriority.HIGH,
        title: '对手经济效率极高',
        message: '对方有玩家金币利用率极高，即使经济相当也可能输出更多，注意站位',
        evidence: ['enemyGoldEfficiency'],
        confidence: Math.min(analysis.summary.count / 10, 1.0) * 0.75,
        audience: 'team'
      })
      break
    }
  }

  return finalizeStage(ctx, advices, { goldEfficiencyCompleted: true })
}

function stageTrueDamageWarning(ctx: PipelineStageContext): PipelineStageContext {
  const advices: PantheonAdvice[] = []
  let enemyTrueDmgTotal = 0
  let enemyCount = 0

  for (const puuid of ctx.enemyPuuids) {
    const analysis = ctx.playerAnalyses[puuid]
    if (!analysis) continue
    enemyTrueDmgTotal += analysis.summary.averageTrueDamageDealtToChampionShareOfTeam
    enemyCount++
  }

  if (enemyCount >= 3) {
    const avgTrueDmg = enemyTrueDmgTotal / enemyCount
    if (avgTrueDmg > 0.15) {
      advices.push({
        type: PantheonAdviceType.TRUE_DAMAGE_WARNING,
        priority: PantheonAdvicePriority.MEDIUM,
        title: '对方真实伤害占比高',
        message: '对方队伍真实伤害占比较高，堆叠护甲魔抗效果有限，优先考虑生命值装备',
        evidence: ['averageTrueDamageDealtToChampionShareOfTeam'],
        confidence: 0.7,
        audience: 'team'
      })
    }
  }

  return finalizeStage(ctx, advices, { trueDamageWarningCompleted: true })
}

function stageCherryStrategy(ctx: PipelineStageContext): PipelineStageContext {
  if (ctx.queueType !== 'CHERRY' && ctx.gameMode !== 'CHERRY') return ctx
  const advices: PantheonAdvice[] = []

  const selfAnalysis = ctx.playerAnalyses[ctx.selfPuuid]
  if (selfAnalysis) {
    const cherry = selfAnalysis.summary.cherry
    if (cherry.count >= 3) {
      if (cherry.top1Rate > 0.3) {
        advices.push({
          type: PantheonAdviceType.CHERRY_STRATEGY,
          priority: PantheonAdvicePriority.LOW,
          title: '斗魂竞技场高手',
          message: `近期${cherry.count}场斗魂竞技场中${(cherry.top1Rate * 100).toFixed(0)}%获得第一，继续发挥`,
          evidence: ['cherryTop1Rate'],
          confidence: Math.min(cherry.count / 8, 1.0) * 0.8,
          audience: 'self'
        })
      } else if (cherry.winRate < 0.3) {
        advices.push({
          type: PantheonAdviceType.CHERRY_STRATEGY,
          priority: PantheonAdvicePriority.MEDIUM,
          title: '斗魂竞技场需调整',
          message: `近期斗魂竞技场胜率${(cherry.winRate * 100).toFixed(0)}%偏低，可以尝试更换英雄或调整增幅选择`,
          evidence: ['cherryWinRate'],
          confidence: Math.min(cherry.count / 5, 1.0) * 0.7,
          audience: 'self'
        })
      }
    }
  }

  advices.push({
    type: PantheonAdviceType.CHERRY_STRATEGY,
    priority: PantheonAdvicePriority.LOW,
    title: '斗魂竞技场提示',
    message: '2v2模式中优先选择有控制或爆发的英雄组合，增幅选择要匹配英雄特性',
    evidence: ['cherryMode'],
    confidence: 0.6,
    audience: 'team'
  })

  return finalizeStage(ctx, advices, { cherryStrategyCompleted: true })
}

function stageWinCondition(ctx: PipelineStageContext): PipelineStageContext {
  if (ctx.gameMode === 'ARAM' || ctx.queueType === 'CHERRY') return ctx
  const advices: PantheonAdvice[] = []

  const allAlly = [ctx.selfPuuid, ...ctx.allyPuuids]
  let totalDmgShare = 0
  let totalTankShare = 0
  let totalKda = 0
  let totalCsPM = 0
  let allyCount = 0

  for (const puuid of allAlly) {
    const analysis = ctx.playerAnalyses[puuid]
    if (!analysis) continue
    totalDmgShare += analysis.summary.averageDamageDealtToChampionShareToTop
    totalTankShare += analysis.summary.averageDamageTakenShareToTop
    totalKda += analysis.summary.averageKda
    totalCsPM += analysis.summary.averageCsPerMinute
    allyCount++
  }

  if (allyCount >= 3) {
    const avgDmg = totalDmgShare / allyCount
    const avgTank = totalTankShare / allyCount
    const avgKda = totalKda / allyCount
    const avgCs = totalCsPM / allyCount

    if (avgDmg > 0.75 && avgKda > 3.0) {
      advices.push({
        type: PantheonAdviceType.WIN_CONDITION,
        priority: PantheonAdvicePriority.MEDIUM,
        title: '胜利条件：团战输出',
        message: '我方输出能力强且生存好，抓住团战机会打出伤害是关键',
        evidence: ['highDamage', 'highKda', 'teamfightWinCondition'],
        confidence: 0.7,
        audience: 'team'
      })
    } else if (avgCs > 7.0 && avgDmg < 0.6) {
      advices.push({
        type: PantheonAdviceType.WIN_CONDITION,
        priority: PantheonAdvicePriority.MEDIUM,
        title: '胜利条件：发育到后期',
        message: '我方补刀能力强但伤害转化需时间，避免前期团战，专注发育到关键装备',
        evidence: ['highCs', 'scalingWinCondition'],
        confidence: 0.65,
        audience: 'team'
      })
    } else if (avgTank > 0.6) {
      advices.push({
        type: PantheonAdviceType.WIN_CONDITION,
        priority: PantheonAdvicePriority.LOW,
        title: '胜利条件：消耗拉锯',
        message: '我方坦度优势明显，拉长团战时间消耗对手资源，不要急于一波',
        evidence: ['highTankiness', 'sustainWinCondition'],
        confidence: 0.6,
        audience: 'team'
      })
    }
  }

  return finalizeStage(ctx, advices, { winConditionCompleted: true })
}

function stageKdaTrend(ctx: PipelineStageContext): PipelineStageContext {
  const advices: PantheonAdvice[] = []
  const selfAnalysis = ctx.playerAnalyses[ctx.selfPuuid]
  if (!selfAnalysis || selfAnalysis.summary.count < 5) return ctx

  const { summary } = selfAnalysis
  const kdCv = summary.kdaCv

  if (kdCv > 0.8 && summary.count >= 5) {
    advices.push({
      type: PantheonAdviceType.KDA_TREND,
      priority: PantheonAdvicePriority.MEDIUM,
      title: 'KDA波动较大',
      message: '近期KDA不够稳定，表现时好时坏，建议控制风险意识，保持一致性',
      evidence: ['kdaCv', 'kdaTrend'],
      confidence: Math.min(summary.count / 10, 1.0) * 0.65,
      audience: 'self'
    })
  }

  if (summary.totalDeaths > 0) {
    const kd = summary.averageKd
    if (kd < 1.0 && summary.count >= 5) {
      advices.push({
        type: PantheonAdviceType.KDA_TREND,
        priority: PantheonAdvicePriority.MEDIUM,
        title: '死亡次数偏高',
        message: `近期场均K/D比${kd.toFixed(2)}，死亡频率偏高，注意走位和地图意识`,
        evidence: ['averageKd', 'deathRate'],
        confidence: Math.min(summary.count / 8, 1.0) * 0.7,
        audience: 'self'
      })
    }
  }

  if (summary.averageGoldShareToTop < 0.6 && summary.averageDamageDealtToChampionShareToTop > 0.75 && ctx.gameMode !== 'ARAM') {
    advices.push({
      type: PantheonAdviceType.KDA_TREND,
      priority: PantheonAdvicePriority.LOW,
      title: '低经济高输出',
      message: '你在经济不高的情况下依然输出占比高，证明操作不错，提升补刀可更强',
      evidence: ['goldShareToTop', 'damageShareToTop'],
      confidence: 0.6,
      audience: 'self'
    })
  }

  return finalizeStage(ctx, advices, { kdaTrendCompleted: true })
}
export class PantheonPipeline {
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

export class PantheonEngine {
  private _pipeline: PantheonPipeline
  private _layers: PantheonCacheLayers<PantheonAdvice[]>
  private _refCounts: PantheonRefCounts<string>
  private _completeness: Map<string, number> = new Map()
  private _cacheMaxAge = 60_000
  private _scheduler: PantheonScheduler
  private _aggregationReducer: RingReducer<number>
  private _lastComparison: TeamComparisonResult | null = null
  private _capture: ExperimentCapture
  private _inference: PantheonInferenceEngine
  private _experimentManager: ExperimentManager
  private _observableStore: PantheonObservableStore
  private _replayAnalysis: ReplayAnalysisPipeline
  private _streamServer: PantheonStreamServer
  private _coordinator: DecisionCoordinator
  private _liveIngestor: LiveIngestor | null = null
  private _metaIngestor: MetaIngestor | null = null
  private _ontologyStore: ObjectStore
  private _pipelineRegistry: PipelineRegistry
  private _ontologyWriter: OntologyWriterStage

  constructor(schedulerConfig?: Partial<SchedulerConfig>) {
    this._pipeline = new PantheonPipeline()
    this._pipeline.addStage('enemy_weakness', stageEnemyWeakness)
    this._pipeline.addStage('team_synergy', stageTeamSynergy)
    this._pipeline.addStage('macro_strategy', stageMacroStrategy)
    this._pipeline.addStage('self_analysis', stageSelfAnalysis)
    this._pipeline.addStage('premade_detection', stagePremadeDetection)
    this._pipeline.addStage('rank_disparity', stageRankDisparity)
    this._pipeline.addStage('lane_matchup', stageLaneMatchup)
    this._pipeline.addStage('composition', stageComposition)
    this._pipeline.addStage('itemization', stageItemization)
    this._pipeline.addStage('objective_timing', stageObjectiveTiming)
    this._pipeline.addStage('playstyle_adaptation', stagePlaystyleAdaptation)
    this._pipeline.addStage('gold_efficiency', stageGoldEfficiency)
    this._pipeline.addStage('true_damage_warning', stageTrueDamageWarning)
    this._pipeline.addStage('cherry_strategy', stageCherryStrategy)
    this._pipeline.addStage('win_condition', stageWinCondition)
    this._pipeline.addStage('kda_trend', stageKdaTrend)

    this._layers = new PantheonCacheLayers<PantheonAdvice[]>()
    this._refCounts = new PantheonRefCounts<string>(
      30_000,
      (key) => {
        this._completeness.delete(key)
      }
    )
    this._refCounts.startAutoGc(5000)
    this._scheduler = createPantheonScheduler(schedulerConfig)
    this._aggregationReducer = new RingReducer<number>(
      (acc, cur) => acc + cur,
      0
    )
    this._capture = createExperimentCapture({ eventCapacity: 500, sampleCapacity: 100 })
    this._capture.startAutoFlush(15_000)
    this._inference = createInferenceEngine()
    this._experimentManager = createExperimentManager()
    this._observableStore = createObservableStore({ staleAfterMs: 30000 })
    this._observableStore.startStaleCheck(15000)
    this._replayAnalysis = createReplayAnalysisPipeline()
    this._streamServer = createStreamServer()
    this._coordinator = createDecisionCoordinator()
    this._ontologyStore = createObjectStore({ gcIntervalMs: 30000 })
    this._ontologyStore.startGc()
    this._pipelineRegistry = createPipelineRegistry()
    this._ontologyWriter = createOntologyWriter(this._ontologyStore)
  }

  get scheduler(): PantheonScheduler {
    return this._scheduler
  }

  get lastComparison(): TeamComparisonResult | null {
    return this._lastComparison
  }

  get capture(): ExperimentCapture {
    return this._capture
  }

  get inference(): PantheonInferenceEngine {
    return this._inference
  }

  setInferenceSessionFactory(factory: OnnxSessionFactory): void {
    this._inference.setSessionFactory(factory)
  }

  async loadInferenceModel(modelPath: string): Promise<boolean> {
    return this._inference.loadModel(modelPath)
  }

  switchInferenceBackend(backend: InferenceBackend): void {
    this._inference.switchBackend(backend)
  }

  getInferenceStats(): PantheonInferenceEngine["stats"] {
    return this._inference.stats
  }

  get experimentManager(): ExperimentManager {
    return this._experimentManager
  }

  get streaming(): PantheonStreamServer {
    return this._streamServer
  }

  getKnownPuuids(): string[] {
    return this._capture.getKnownPuuids()
  }

  get observableStore(): PantheonObservableStore {
    return this._observableStore
  }

  get coordinator(): DecisionCoordinator {
    return this._coordinator
  }

  getCoordinatedAdvices(): PantheonAdvice[] {
    return this._coordinator.extractFusedAdvices()
  }

  getCoordinatorStats(): DecisionCoordinator["stats"] {
    return this._coordinator.stats
  }

  recordCoordinatorFeedback(
    adviceType: string,
    feedback: 'helpful' | 'not-helpful' | 'dismiss',
    gamePhase: GamePhase,
    sessionId: string
  ): void {
    this._coordinator.recordFeedback(adviceType, feedback, gamePhase, sessionId)
  }

  ingestReplayForCoordinator(report: ReplayAnalysisReport): void {
    this._coordinator.ingestReplayReport(report)
  }

  createExperiment(params: {
    name: string
    description?: string
    trafficSplit?: number
  }): ExperimentDefinition {
    return this._experimentManager.createExperiment(params)
  }

  startExperiment(experimentId: string): boolean {
    return this._experimentManager.startExperiment(experimentId)
  }

  completeExperiment(experimentId: string): ExperimentSnapshot | null {
    return this._experimentManager.completeExperiment(experimentId)
  }

  getExperimentSnapshot(experimentId: string): ExperimentSnapshot | null {
    return this._experimentManager.getSnapshot(experimentId)
  }

  assignExperimentSession(puuid: string, sessionId: string): SessionAssignment | null {
    return this._experimentManager.assignSession(puuid, sessionId)
  }

  subscribeToAdvices(key: string, listener: SubjectListener<PantheonAdvice[]>): () => void {
    return this._observableStore.subscribe<PantheonAdvice[]>(key, listener)
  }

  getObservableStoreStats(): PantheonObservableStore["stats"] {
    return this._observableStore.stats
  }

  get replayAnalysis(): ReplayAnalysisPipeline {
    return this._replayAnalysis
  }

  analyzeReplay(params: Parameters<ReplayAnalysisPipeline['analyzeReplay']>[0]): ReplayAnalysisReport {
    const report = this._replayAnalysis.analyzeReplay({
      ...params,
      pendingSamples: this._capture.getSamples()
    })

    const activeExpId = this._experimentManager.activeExperimentId
    if (activeExpId) {
      const sessionKey = `${params.selfPuuid}:${params.eogStats.gameMode}`
      this._experimentManager.recordOutcome(sessionKey, report.outcome.outcome)
    }

    this._observableStore.write(`replay:${params.eogStats.gameId}`, report, 'loaded')
    if (this._streamServer.isRunning) this._streamServer.broadcastReplayAnalysis(report)
    this._coordinator.ingestReplayReport(report)
    return report
  }

  getReplayReports(): ReplayAnalysisReport[] {
    return this._replayAnalysis.getReports()
  }

  getAccuracyHistory(): ReturnType<ReplayAnalysisPipeline['getAccuracyHistory']> {
    return this._replayAnalysis.getAccuracyHistory()
  }

  getPredictionErrors(): ReturnType<ReplayAnalysisPipeline['getPredictionErrorHistory']> {
    return this._replayAnalysis.getPredictionErrorHistory()
  }

  get streamServer(): PantheonStreamServer {
    return this._streamServer
  }

  async startStreaming(port?: number): Promise<boolean> {
    if (port) {
      this._streamServer.dispose()
      this._streamServer = createStreamServer({ port })
    }
    return this._streamServer.start(this._capture.sessionId)
  }

  stopStreaming(): void {
    this._streamServer.stop()
  }

  getStreamStats(): PantheonStreamServer["stats"] {
    return this._streamServer.stats
  }

  initLiveIngestor(
    fetchers: {
      fetchPlayerList: () => Promise<PlayerList[]>
      fetchGameStats: () => Promise<GameStats>
      fetchEventData: () => Promise<{ Events: Record<string, unknown>[] }>
    },
    config?: Partial<{
      pollIntervalMs: number
      snapshotBufferCapacity: number
      eventBufferCapacity: number
      maxConsecutiveErrors: number
      enableDerivedTimeSeries: boolean
      enableRawDump: boolean
    }>
  ): LiveIngestor {
    if (this._liveIngestor) {
      this._liveIngestor.dispose()
    }
    this._liveIngestor = createLiveIngestor(fetchers, config)
    return this._liveIngestor
  }

  get liveIngestor(): LiveIngestor | null {
    return this._liveIngestor
  }

  getLiveIngestorStats(): LiveIngestorStats | null {
    return this._liveIngestor?.getStats() ?? null
  }

  getLiveIngestorSession(): Readonly<LiveIngestorSession> | null {
    return this._liveIngestor?.session ?? null
  }

  getLiveEvents(type?: LiveEventType): LiveGameEvent[] {
    if (!this._liveIngestor) return []
    return type
      ? this._liveIngestor.getEventsByType(type)
      : this._liveIngestor.getEvents()
  }

  getLiveSnapshots(): GameSnapshot[] {
    return this._liveIngestor?.getSnapshots() ?? []
  }

  getLiveObjectiveTimeline(): LiveGameEvent[] {
    return this._liveIngestor?.getObjectiveTimeline() ?? []
  }

  getLiveKillFeed(lastN?: number): LiveGameEvent[] {
    return this._liveIngestor?.getKillFeed(lastN) ?? []
  }

  onLiveEvent(listener: LiveEventListener): () => void {
    if (!this._liveIngestor) return () => {}
    return this._liveIngestor.onEvent(listener)
  }

  onLiveSnapshot(listener: SnapshotListener): () => void {
    if (!this._liveIngestor) return () => {}
    return this._liveIngestor.onSnapshot(listener)
  }

  initMetaIngestor(
    fetchers: {
      fetchChampion: (options: {
        id: number
        region: string
        mode: string
        tier: string
        position?: string
      }) => Promise<unknown>
      fetchAramBalance?: () => Promise<unknown>
      fetchFandomBalance?: () => Promise<Record<string, unknown>>
    },
    config?: Partial<{
      cacheTtlMs: number
      maxCacheSize: number
      defaultRegion: string
      defaultTier: string
    }>
  ): MetaIngestor {
    if (this._metaIngestor) {
      this._metaIngestor.dispose()
    }
    this._metaIngestor = createMetaIngestor(fetchers as Parameters<typeof createMetaIngestor>[0], config)
    return this._metaIngestor
  }

  get metaIngestor(): MetaIngestor | null {
    return this._metaIngestor
  }

  getMetaIngestorStats(): MetaIngestorStatsType | null {
    return this._metaIngestor?.getStats() ?? null
  }

  async ingestChampionMeta(championId: number, gameMode?: string): Promise<ChampionMetaWithBalance | null> {
    if (!this._metaIngestor) return null
    return this._metaIngestor.ingestChampion({ championId, gameMode })
  }

  async ingestDraftMeta(championIds: number[], gameMode?: string): Promise<Map<number, ChampionMetaWithBalance>> {
    if (!this._metaIngestor) return new Map()
    return this._metaIngestor.ingestDraft({ championIds, gameMode })
  }

  onChampionMeta(listener: ChampionMetaListener): () => void {
    if (!this._metaIngestor) return () => {}
    return this._metaIngestor.onMeta(listener)
  }

  get ontologyStore(): ObjectStore {
    return this._ontologyStore
  }

  getOntologyStoreStats(): ObjectStoreStats {
    return this._ontologyStore.getStats()
  }

  ontologyWrite<T>(objectType: OntologyObjectType, primaryKey: string, value: T, ttlMs?: number): void {
    this._ontologyStore.write(objectType, primaryKey, value, ttlMs)
  }

  ontologyRead<T>(objectType: OntologyObjectType, primaryKey: string): T | null {
    return this._ontologyStore.read<T>(objectType, primaryKey)
  }

  ontologyQueryByType<T>(objectType: OntologyObjectType): T[] {
    return this._ontologyStore.queryByType<T>(objectType)
  }

  ontologyAddLink(
    sourceType: OntologyObjectType,
    sourceKey: string,
    linkType: OntologyLinkType,
    targetType: OntologyObjectType,
    targetKey: string
  ): boolean {
    return this._ontologyStore.addLink(sourceType, sourceKey, linkType, targetType, targetKey)
  }

  ontologyGetLinked<T>(
    sourceType: OntologyObjectType,
    sourceKey: string,
    linkType: OntologyLinkType
  ): T[] {
    return this._ontologyStore.getLinkedObjects<T>(sourceType, sourceKey, linkType)
  }

  ontologySubscribe<T>(
    objectType: OntologyObjectType,
    primaryKey: string,
    listener: ObjectListener<T>
  ): () => void {
    return this._ontologyStore.subscribe(objectType, primaryKey, listener)
  }

  ontologySubscribeType(objectType: OntologyObjectType, listener: TypeListener): () => void {
    return this._ontologyStore.subscribeType(objectType, listener)
  }

  ontologyOnChange(listener: GlobalChangeListener): () => void {
    return this._ontologyStore.onChange(listener)
  }

  objectSet<T = unknown>(objectType: OntologyObjectType): ObjectSet<T> {
    return createObjectSet<T>(this._ontologyStore, objectType)
  }

  ontologyQuery<T>(
    objectType: OntologyObjectType,
    where?: WhereClause,
    orderByField?: string,
    orderByDir?: 'asc' | 'desc',
    limit?: number
  ): T[] {
    let set = this.objectSet<T>(objectType)
    if (where) set = set.where(where)
    if (orderByField) set = set.orderBy(orderByField, orderByDir ?? 'asc')
    if (limit) set = set.limit(limit)
    return set.fetchAll()
  }

  ontologyAggregate(
    objectType: OntologyObjectType,
    clauses: AggregationClause[],
    where?: WhereClause
  ): AggregationResult[] {
    let set = this.objectSet(objectType)
    if (where) set = set.where(where)
    return set.aggregate(clauses)
  }

  ontologyFetchPage<T>(
    objectType: OntologyObjectType,
    offset: number,
    pageSize: number,
    where?: WhereClause,
    orderByField?: string,
    orderByDir?: 'asc' | 'desc'
  ): FetchPageResult<T> {
    let set = this.objectSet<T>(objectType)
    if (where) set = set.where(where)
    if (orderByField) set = set.orderBy(orderByField, orderByDir ?? 'asc')
    return set.fetchPage(offset, pageSize)
  }

  get pipelineRegistry(): PipelineRegistry {
    return this._pipelineRegistry
  }

  get ontologyWriter(): OntologyWriterStage {
    return this._ontologyWriter
  }

  registerPipeline<I, O>(pipeline: TransformPipeline<I, O>): void {
    this._pipelineRegistry.register(pipeline)
  }

  executePipeline<I, O>(name: string, input: I): PipelineResult<O> | null {
    return this._pipelineRegistry.execute<I, O>(name, input)
  }

  listPipelines(): PipelineDescriptor[] {
    return this._pipelineRegistry.listPipelines()
  }

  getPipelineMetrics(name: string): StageMetrics[] | null {
    const pipeline = this._pipelineRegistry.get(name)
    return pipeline?.getStageMetrics() ?? null
  }

  generateAdvices(params: {
    playerStats: {
      players: Record<string, MatchHistoryGamesAnalysisAll>
      teams: Record<string, MatchHistoryGamesAnalysisTeamSide>
    } | null
    championSelections: Record<string, number>
    positionAssignments: Record<string, { position: string; role: ParsedRole | null }>
    rankedStats: Record<string, { data: RankedStats }>
    selfPuuid: string
    allyMembers: string[]
    enemyMembers: string[]
    gameMode: string
    queueType: string
    inferredPremadeTeams?: Record<string, string[][]>
    queryPhase?: string
    gameTimeSeconds?: number
  }): PantheonAdvice[] {
    if (!params.playerStats) return []
    const pipelineStart = Date.now()

    const keyParams: PantheonCacheKeyParams = {
      selfPuuid: params.selfPuuid,
      championSelections: params.championSelections,
      gameMode: params.gameMode,
      rankedAvailability: Object.keys(params.rankedStats || {}),
      analysisAvailability: Object.keys(params.playerStats.players),
      gamePhase: params.queryPhase || 'champ-select',
      positionAvailability: Object.keys(params.positionAssignments)
    }
    const cacheKey = canonicalizeCacheKey(keyParams)
    const newCompleteness = computeDataCompleteness(keyParams)

    const cached = this._layers.read(cacheKey)
    if (cached) {
      const existingCompleteness = this._completeness.get(cacheKey) ?? 0
      if (!shouldReplace(existingCompleteness, newCompleteness, cached.lastUpdated, this._cacheMaxAge)) {
        this._refCounts.retain(cacheKey)
        return cached.value
      }
    }

    const gamePhase = mapQueryPhaseToGamePhase(
      params.queryPhase || 'champ-select',
      params.gameTimeSeconds
    )
    this._scheduler.transitionPhase(gamePhase)

    const profile = runProfilePass({
      playerStats: params.playerStats,
      championSelections: params.championSelections,
      positionAssignments: params.positionAssignments,
      rankedStats: params.rankedStats,
      selfPuuid: params.selfPuuid,
      allyMembers: params.allyMembers,
      enemyMembers: params.enemyMembers,
      gameMode: params.gameMode,
      queueType: params.queueType,
      gamePhase,
      inferredPremadeTeams: params.inferredPremadeTeams || {}
    })
    this._lastComparison = profile.teamComparison

    const batchCtx = new BatchAggregationContext()
    batchCtx.stage('teamComparison', profile.teamComparison)
    batchCtx.stage('allyProfile', profile.allyProfile)
    batchCtx.stage('enemyProfile', profile.enemyProfile)
    batchCtx.commit()

    for (const entry of profile.allyScores) {
      this._aggregationReducer.push(entry.puuid, entry.score.total)
    }

    const allyPuuids = profile.allyPuuids
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
      allyPuuids,
      enemyPuuids: params.enemyMembers,
      gameMode: params.gameMode,
      queueType: params.queueType,
      teamComparison: profile.teamComparison,
      allyProfile: profile.allyProfile,
      enemyProfile: profile.enemyProfile,
      currentGamePhase: gamePhase,
      profile
    }

    const result = this._pipeline.execute(ctx)
    const sorted = result.advices.sort((a, b) => a.priority - b.priority)
    const deduped = this._deduplicateAdvices(sorted)

    this._scheduler.enqueue(deduped)

    this._layers.writeTruth(cacheKey, deduped)
    this._completeness.set(cacheKey, newCompleteness)
    this._refCounts.register(cacheKey)
    this._refCounts.retain(cacheKey)

    const pipelineDuration = Date.now() - pipelineStart
    this._capture.captureAdviceGenerated(deduped, gamePhase, pipelineDuration)

    const activeExpId = this._experimentManager.activeExperimentId
    if (activeExpId) {
      const sessionKey = `${params.selfPuuid}:${params.gameMode}`
      this._experimentManager.recordAdviceGeneration(sessionKey, deduped, pipelineDuration, gamePhase)
    }

    this._observableStore.write(`advices:${cacheKey}`, deduped, 'loaded')
    this._observableStore.write(`phase:${params.selfPuuid}`, gamePhase, 'loaded')

    if (profile.teamComparison) {
      this._capture.captureTeamComparison(profile.teamComparison, gamePhase)
    }

    const selfAnalysisForFeature = params.playerStats.players[params.selfPuuid] || null
    const selfChampId = params.championSelections[params.selfPuuid] || null

    const featureVector = this._capture.extractFeatureVector({
      selfAnalysis: selfAnalysisForFeature,
      selfChampionId: selfChampId,
      selfRankNumeric: profile.selfRank.numeric,
      allyProfile: profile.allyProfile,
      enemyProfile: profile.enemyProfile,
      teamComparison: profile.teamComparison,
      gameMode: params.gameMode,
      queueType: params.queueType,
      gamePhase,
      premadeGroupMaxSize: profile.premadeMaxSize,
      rankGapMax: profile.rankGapMax,
      laneRankGap: profile.laneMatchup?.laneRankGap ?? 0,
      allyPhysDamageShare: profile.allyDamageProfile.physicalShare,
      allyMagicDamageShare: profile.allyDamageProfile.magicalShare,
      dataCompletenessRatio: newCompleteness / 100
    })

    this._capture.captureFeatureSnapshot(featureVector, gamePhase)
    this._capture.buildTrainingSample(featureVector, deduped, gamePhase)

    const inferenceResult = this._inference.predictSync(featureVector, gamePhase)

    const replayHints = this._replayAnalysis.getHintAdvices()
    this._coordinator.coordinate(
      deduped,
      inferenceResult,
      replayHints,
      gamePhase
    )
    const coordinatedAdvices = this._coordinator.extractFusedAdvices()
    this._observableStore.write(`coordinated:${cacheKey}`, coordinatedAdvices, 'loaded')

    if (this._streamServer.isRunning) {
      this._streamServer.broadcastAdvices(deduped, gamePhase)
      this._streamServer.broadcastFeatureSnapshot(featureVector, gamePhase)
    }

    return deduped
  }

    pushOptimisticAdvices(key: string, advices: PantheonAdvice[]): string {
    const layerId = `optimistic-${Date.now()}`
    this._layers.pushOptimistic(layerId)
    this._layers.writeOptimistic(key, advices)
    return layerId
  }

    removeOptimistic(layerId: string): void {
    this._layers.removeOptimistic(layerId)
  }

    getLastPipelineInfo(params: {
    playerStats: {
      players: Record<string, MatchHistoryGamesAnalysisAll>
      teams: Record<string, MatchHistoryGamesAnalysisTeamSide>
    } | null
    allyMembers: string[]
    enemyMembers: string[]
    selfPuuid: string
  }): { allyAvgScore: number; enemyAvgScore: number; scoreDiff: number } | null {
    if (!params.playerStats) return null
    const allAlly = [params.selfPuuid, ...params.allyMembers.filter((p) => p !== params.selfPuuid)]
    const allyPass = computeTeamScorePass(
      allAlly,
      params.playerStats.players
    )
    const enemyPass = computeTeamScorePass(
      params.enemyMembers,
      params.playerStats.players
    )
    const allyAvg = allyPass.count > 0 ? allyPass.total / allyPass.count : 0
    const enemyAvg = enemyPass.count > 0 ? enemyPass.total / enemyPass.count : 0
    return { allyAvgScore: allyAvg, enemyAvgScore: enemyAvg, scoreDiff: allyAvg - enemyAvg }
  }

  formatAsMessages(
    advices: PantheonAdvice[],
    options: {
      maxLines?: number
      audience?: 'self' | 'ally' | 'team'
      minPriority?: PantheonAdvicePriority
    } = {}
  ): string[] {
    const { maxLines = 8, audience, minPriority = PantheonAdvicePriority.INFO } = options
    let filtered = advices.filter((a) => a.priority <= minPriority)
    if (audience) {
      filtered = filtered.filter((a) => a.audience === audience || a.audience === 'team')
    }
    return filtered.slice(0, maxLines).map((advice) => {
      const tag =
        advice.priority <= PantheonAdvicePriority.HIGH
          ? '❗'
          : advice.priority === PantheonAdvicePriority.MEDIUM
            ? '📋'
            : 'ℹ️'
      return `${tag} [${advice.title}] ${advice.message}`
    })
  }

    clearCache() {
    this._layers.clearAll()
    this._refCounts.clear()
    this._completeness.clear()
    this._scheduler.clear()
    this._aggregationReducer.clear()
    this._lastComparison = null
    this._capture.clear()
    this._inference.clearCache()
    this._observableStore.clear()
    this._coordinator.clear()
    if (this._liveIngestor) {
      this._liveIngestor.stopPolling()
    }
    if (this._metaIngestor) {
      this._metaIngestor.clear()
    }
    this._ontologyStore.clear()
    this._pipelineRegistry.clear()
    this._ontologyWriter.resetStats()
  }

    dispose() {
    this._refCounts.stopAutoGc()
    this._capture.dispose()
    this._inference.dispose()
    this._experimentManager.dispose()
    this._observableStore.dispose()
    this._replayAnalysis.dispose()
    this._streamServer.dispose()
    this._coordinator.dispose()
    if (this._liveIngestor) {
      this._liveIngestor.dispose()
      this._liveIngestor = null
    }
    if (this._metaIngestor) {
      this._metaIngestor.dispose()
      this._metaIngestor = null
    }
    this._ontologyStore.dispose()
    this._pipelineRegistry.dispose()
    this.clearCache()
  }

  getScheduledAdvices(count: number): PantheonAdvice[] {
    const scheduled = this._scheduler.dequeue(count)
    return scheduled.map((s) => s.advice)
  }

  peekScheduledAdvices(count: number): PantheonAdvice[] {
    const peeked = this._scheduler.peek(count)
    return peeked.map((s) => s.advice)
  }

  getSchedulerStats(): {
    totalQueued: number
    delivered: number
    expired: number
    suppressed: number
    avgRelevance: number
    currentPhase: GamePhase
    phaseTransitions: number
  } {
    const stats = this._scheduler.getStats()
    return {
      ...stats,
      currentPhase: this._scheduler.currentPhase,
      phaseTransitions: this._scheduler.phaseHistory.length
    }
  }

  suppressAdviceType(type: string): void {
    this._scheduler.suppressType(type)
  }

  unsuppressAdviceType(type: string): void {
    this._scheduler.unsuppressType(type)
  }

  getTeamComparisonSummary(): {
    allyProfile: AggregatedTeamProfile
    enemyProfile: AggregatedTeamProfile
    overallDelta: number
    confidence: number
    aggregatedTeamScore: number
  } | null {
    if (!this._lastComparison) return null
    return {
      allyProfile: this._lastComparison.allyProfile,
      enemyProfile: this._lastComparison.enemyProfile,
      overallDelta: this._lastComparison.overallDelta,
      confidence: this._lastComparison.confidence,
      aggregatedTeamScore: this._aggregationReducer.reduce()
    }
  }

  startExperimentSession(params: {
    gameMode: string
    queueType: string
    selfPuuid: string
  }): string {
    return this._capture.startSession(params)
  }

  endExperimentSession(): CaptureSessionMeta {
    return this._capture.endSession()
  }

  setGameOutcome(sessionId: string, outcome: 'win' | 'loss' | 'unknown'): number {
    return this._capture.setOutcome(sessionId, outcome)
  }

  recordUserFeedback(
    adviceType: string,
    feedback: 'helpful' | 'not-helpful' | 'dismiss'
  ): void {
    this._capture.captureUserFeedback(
      adviceType,
      feedback,
      this._scheduler.currentPhase
    )
    this._coordinator.recordFeedback(
      adviceType,
      feedback,
      this._scheduler.currentPhase,
      this._capture.sessionId
    )
  }

  getExperimentExport(): {
    meta: CaptureSessionMeta
    events: ReturnType<ExperimentCapture['getEvents']>
    samples: ReturnType<ExperimentCapture['getSamples']>
    accumulatorStats: Record<string, { avg: number; min: number; max: number; count: number }>
  } {
    return this._capture.getExportPayload()
  }

  getTrainingSamples(): TrainingSample[] {
    return this._capture.getSamples()
  }

  getCaptureStats(): {
    sessionId: string
    isActive: boolean
    eventCount: number
    sampleCount: number
    mergeCount: number
  } {
    const meta = this._capture.sessionMeta
    return {
      sessionId: this._capture.sessionId,
      isActive: this._capture.isActive,
      eventCount: meta.eventCount,
      sampleCount: meta.sampleCount,
      mergeCount: this._capture.accumulator.mergeCount
    }
  }

    private _deduplicateAdvices(advices: PantheonAdvice[]): PantheonAdvice[] {
    const seen = new Map<string, PantheonAdvice>()
    for (const advice of advices) {
      const key = `${advice.type}:${advice.title}`
      const existing = seen.get(key)
      if (!existing || advice.confidence > existing.confidence) {
        seen.set(key, advice)
      }
    }
    return Array.from(seen.values())
  }
}

export function createPantheonEngine(schedulerConfig?: Partial<SchedulerConfig>): PantheonEngine {
  return new PantheonEngine(schedulerConfig)
}

export const additionalContext: unique symbol = Symbol("additionalContext")

export interface Client {
  <Q extends import('./types').ObjectOrInterfaceDefinition>(
    o: Q,
  ): import('./types').PipelineSet<Q>

  fetchMetadata(o: unknown): Promise<unknown>

  [additionalContext]: {
    baseUrl: string
    tokenProvider: () => Promise<string>
    fetch: typeof globalThis.fetch
    gameStateRid: string | Promise<string>
    gameStateProvider: unknown
    logger?: import('./types').Logger
    branch?: string
    objectFactory: (...args: unknown[]) => unknown
    objectSetFactory: (...args: unknown[]) => unknown
    narrowTypeInterfaceOrObjectMapping: Record<string, 'pipeline' | 'interface'>
  }

  branch?: string
}
