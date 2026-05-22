
import {
  MatchHistoryGamesAnalysisAll,
  MatchHistoryChampionAnalysis,
  AkariScore,
  calculateAkariScore
} from './analysis'
import { RankedStats } from '@shared/types/league-client/ranked'
import {
  CoachCacheLayers,
  CoachRefCounts,
  canonicalizeCacheKey,
  computeDataCompleteness,
  shouldReplace
} from './coach-cache'
import type { CoachCacheKeyParams } from './coach-cache'
import {
  aggregateTeamProfile,
  compareTeams,
  RingReducer,
  BatchAggregationContext
} from './coach-cache/aggregator'
import type { TeamComparisonResult, AggregatedTeamProfile } from './coach-cache/aggregator'
import {
  CoachScheduler,
  createCoachScheduler,
  mapQueryPhaseToGamePhase
} from './coach-scheduler'
import type { GamePhase, ScheduledAdvice, SchedulerConfig } from './coach-scheduler'

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
  MENTAL = 'mental',
  LANE_MATCHUP = 'lane_matchup',
  RANK_DISPARITY = 'rank_disparity',
  COMPOSITION = 'composition',
  ITEMIZATION_HINT = 'itemization_hint',
  OBJECTIVE_TIMING = 'objective_timing',
  PLAYSTYLE_ADAPTATION = 'playstyle_adaptation'
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
  teamComparison: TeamComparisonResult | null
  allyProfile: AggregatedTeamProfile | null
  enemyProfile: AggregatedTeamProfile | null
  currentGamePhase: GamePhase
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
    allyPerPlayer: allyPass.perPlayer,
    enemyPerPlayer: enemyPass.perPlayer,
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

function stageRankDisparity(ctx: PipelineStageContext): PipelineStageContext {
  if (ctx.gameMode === 'ARAM') return ctx
  const advices: CoachAdvice[] = []

  const selfRank = getRankNumeric(ctx.rankedStats, ctx.selfPuuid)

  let highestEnemyRank = -1
  let highestEnemyPuuid = ''
  for (const puuid of ctx.enemyPuuids) {
    const r = getRankNumeric(ctx.rankedStats, puuid)
    if (r > highestEnemyRank) {
      highestEnemyRank = r
      highestEnemyPuuid = puuid
    }
  }

  if (selfRank >= 0 && highestEnemyRank >= 0) {
    const gap = highestEnemyRank - selfRank
    if (gap >= 8) {
      advices.push({
        type: CoachAdviceType.RANK_DISPARITY,
        priority: CoachAdvicePriority.HIGH,
        title: '对方有高段位玩家',
        message: `对方有${getRankLabel(ctx.rankedStats, highestEnemyPuuid)}段位玩家，注意避免正面硬刚，利用团队配合`,
        evidence: ['rankNumeric_gap'],
        confidence: 0.85,
        audience: 'team'
      })
    } else if (gap <= -8) {
      advices.push({
        type: CoachAdviceType.RANK_DISPARITY,
        priority: CoachAdvicePriority.LOW,
        title: '段位优势',
        message: '我方段位整体占优，自信发挥但不要轻敌',
        evidence: ['rankNumeric_advantage'],
        confidence: 0.7,
        audience: 'self'
      })
    }
  }

  const selfPos = ctx.positionAssignments[ctx.selfPuuid]?.position
  if (selfPos && selfRank >= 0) {
    for (const puuid of ctx.enemyPuuids) {
      const enemyPos = ctx.positionAssignments[puuid]?.position
      if (enemyPos === selfPos) {
        const enemyRank = getRankNumeric(ctx.rankedStats, puuid)
        if (enemyRank >= 0) {
          const laneGap = enemyRank - selfRank
          if (laneGap >= 6) {
            advices.push({
              type: CoachAdviceType.LANE_MATCHUP,
              priority: CoachAdvicePriority.HIGH,
              title: '对线对手段位较高',
              message: `你的对线是${getRankLabel(ctx.rankedStats, puuid)}，对线可以更谨慎，优先保证不亏`,
              evidence: ['laneRankGap'],
              confidence: 0.8,
              audience: 'self'
            })
          } else if (laneGap <= -6) {
            advices.push({
              type: CoachAdviceType.LANE_MATCHUP,
              priority: CoachAdvicePriority.LOW,
              title: '对线段位优势',
              message: `对线对手段位较低（${getRankLabel(ctx.rankedStats, puuid)}），可以积极打出优势`,
              evidence: ['laneRankAdvantage'],
              confidence: 0.75,
              audience: 'self'
            })
          }
        }
        break // only one lane opponent
      }
    }
  }

  return finalizeStage(ctx, advices, { rankDisparityCompleted: true })
}

function stageLaneMatchup(ctx: PipelineStageContext): PipelineStageContext {
  if (ctx.gameMode === 'ARAM') return ctx
  const advices: CoachAdvice[] = []

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
          type: CoachAdviceType.LANE_MATCHUP,
          priority: CoachAdvicePriority.HIGH,
          title: '对线对手英雄熟练度高',
          message: `对方该英雄${enemyChampData.count}场胜率${(wr * 100).toFixed(0)}%，是其拿手英雄，对线需谨慎`,
          evidence: ['enemyChampionMastery'],
          confidence: Math.min(enemyChampData.count / 10, 1.0) * 0.8,
          audience: 'self'
        })
      } else if (wr < 0.35) {
        advices.push({
          type: CoachAdviceType.LANE_MATCHUP,
          priority: CoachAdvicePriority.MEDIUM,
          title: '对线对手该英雄胜率低',
          message: `对方该英雄近期${enemyChampData.count}场胜率仅${(wr * 100).toFixed(0)}%，可寻找机会建立优势`,
          evidence: ['enemyChampionWeakness'],
          confidence: Math.min(enemyChampData.count / 8, 1.0) * 0.7,
          audience: 'self'
        })
      }
    } else if (!enemyChampData) {
      advices.push({
        type: CoachAdviceType.LANE_MATCHUP,
        priority: CoachAdvicePriority.MEDIUM,
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
          type: CoachAdviceType.LANING_PHASE,
          priority: CoachAdvicePriority.MEDIUM,
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
  const advices: CoachAdvice[] = []

  let totalPhysShare = 0
  let totalMagicShare = 0
  let totalTankShare = 0
  let allyCount = 0

  const allAlly = [ctx.selfPuuid, ...ctx.allyPuuids]
  for (const puuid of allAlly) {
    const analysis = ctx.playerAnalyses[puuid]
    if (!analysis) continue
    totalPhysShare += analysis.summary.averagePhysicalDamageDealtToChampionShareOfTeam
    totalMagicShare += analysis.summary.averageMagicDamageDealtToChampionShareOfTeam
    totalTankShare += analysis.summary.averageDamageTakenShareOfTeam
    allyCount++
  }

  if (allyCount >= 3) {
    const avgPhys = totalPhysShare / allyCount
    const avgMagic = totalMagicShare / allyCount

    if (avgPhys > 0.7 && avgMagic < 0.2) {
      advices.push({
        type: CoachAdviceType.COMPOSITION,
        priority: CoachAdvicePriority.MEDIUM,
        title: '阵容物理伤害占比过高',
        message: '我方阵容以物理伤害为主，对方可能出护甲装堆叠，中后期需注意穿透装备',
        evidence: ['teamPhysicalDamageShare'],
        confidence: 0.65,
        audience: 'team'
      })
    } else if (avgMagic > 0.7 && avgPhys < 0.2) {
      advices.push({
        type: CoachAdviceType.COMPOSITION,
        priority: CoachAdvicePriority.MEDIUM,
        title: '阵容魔法伤害占比过高',
        message: '我方阵容以魔法伤害为主，对方可能出魔抗装堆叠，注意法术穿透',
        evidence: ['teamMagicDamageShare'],
        confidence: 0.65,
        audience: 'team'
      })
    }

    const maxTankShare = Math.max(
      ...allAlly
        .map((p) => ctx.playerAnalyses[p]?.summary.averageDamageTakenShareOfTeam ?? 0)
    )
    if (maxTankShare < 0.25 && allyCount >= 4) {
      advices.push({
        type: CoachAdviceType.COMPOSITION,
        priority: CoachAdvicePriority.LOW,
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
  const advices: CoachAdvice[] = []
  const comparison = ctx.teamComparison

  if (comparison && comparison.confidence > 0.3) {
    const physDelta = comparison.dimensionDeltas.damage
    const tankDelta = comparison.dimensionDeltas.tankiness

    if (comparison.enemyProfile && comparison.enemyProfile.avgDamageShare > 0.75) {
      advices.push({
        type: CoachAdviceType.ITEMIZATION_HINT,
        priority: CoachAdvicePriority.MEDIUM,
        title: '对方输出集中',
        message: '对方队伍输出集中度高，可考虑出针对性防御装备降低其团战影响',
        evidence: ['enemyDamageConcentration', 'teamComparison'],
        confidence: comparison.confidence * 0.7,
        audience: 'team'
      })
    }

    if (comparison.allyProfile && comparison.allyProfile.avgTankinessShare < 0.2) {
      advices.push({
        type: CoachAdviceType.ITEMIZATION_HINT,
        priority: CoachAdvicePriority.MEDIUM,
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
          type: CoachAdviceType.ITEMIZATION_HINT,
          priority: CoachAdvicePriority.LOW,
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
  const advices: CoachAdvice[] = []
  const comparison = ctx.teamComparison

  if (comparison && comparison.confidence > 0.3) {
    if (comparison.overallDelta > 0.05) {
      advices.push({
        type: CoachAdviceType.OBJECTIVE_TIMING,
        priority: CoachAdvicePriority.MEDIUM,
        title: '主动争夺目标',
        message: '我方整体数据占优，建议主动控制龙坑和峡谷先锋资源，扩大视野后开团',
        evidence: ['teamAdvantage', 'overallDelta'],
        confidence: comparison.confidence * 0.75,
        audience: 'team'
      })
    } else if (comparison.overallDelta < -0.05) {
      advices.push({
        type: CoachAdviceType.OBJECTIVE_TIMING,
        priority: CoachAdvicePriority.MEDIUM,
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
          type: CoachAdviceType.OBJECTIVE_TIMING,
          priority: CoachAdvicePriority.MEDIUM,
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
  const advices: CoachAdvice[] = []
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
        type: CoachAdviceType.PLAYSTYLE_ADAPTATION,
        priority: CoachAdvicePriority.LOW,
        title: '高输出但风险偏高',
        message: '你的伤害占比高但KDA偏低，可适当减少冒险换血，在确保生存的前提下输出',
        evidence: ['highDamage', 'lowSurvival'],
        confidence: 0.65,
        audience: 'self'
      })
    }

    if (isHighCs && avgDamageShare < 0.5 && ctx.gameMode !== 'ARAM') {
      advices.push({
        type: CoachAdviceType.PLAYSTYLE_ADAPTATION,
        priority: CoachAdvicePriority.LOW,
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
          type: CoachAdviceType.PLAYSTYLE_ADAPTATION,
          priority: CoachAdvicePriority.MEDIUM,
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
  private _layers: CoachCacheLayers<CoachAdvice[]>
  private _refCounts: CoachRefCounts<string>
  private _completeness: Map<string, number> = new Map()
  private _cacheMaxAge = 60_000
  private _scheduler: CoachScheduler
  private _aggregationReducer: RingReducer<number>
  private _lastComparison: TeamComparisonResult | null = null

  constructor(schedulerConfig?: Partial<SchedulerConfig>) {
    this._pipeline = new CoachPipeline()
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

    this._layers = new CoachCacheLayers<CoachAdvice[]>()
    this._refCounts = new CoachRefCounts<string>(
      30_000,
      (key) => {
        this._completeness.delete(key)
      }
    )
    this._refCounts.startAutoGc(5000)
    this._scheduler = createCoachScheduler(schedulerConfig)
    this._aggregationReducer = new RingReducer<number>(
      (acc, cur) => acc + cur,
      0
    )
  }

  get scheduler(): CoachScheduler {
    return this._scheduler
  }

  get lastComparison(): TeamComparisonResult | null {
    return this._lastComparison
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
    queryPhase?: string
    gameTimeSeconds?: number
  }): CoachAdvice[] {
    if (!params.playerStats) return []

    const keyParams: CoachCacheKeyParams = {
      selfPuuid: params.selfPuuid,
      championSelections: params.championSelections,
      gameMode: params.gameMode,
      rankedAvailability: Object.keys(params.rankedStats || {}),
      analysisAvailability: Object.keys(params.playerStats.players)
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

    const batchCtx = new BatchAggregationContext()
    const allyPuuids = params.allyMembers.filter((p) => p !== params.selfPuuid)
    const allAllyPuuids = [params.selfPuuid, ...allyPuuids]

    const teamComparison = compareTeams(
      allAllyPuuids,
      params.enemyMembers,
      params.playerStats.players
    )
    this._lastComparison = teamComparison

    const allyProfile = aggregateTeamProfile(allAllyPuuids, params.playerStats.players)
    const enemyProfile = aggregateTeamProfile(params.enemyMembers, params.playerStats.players)

    batchCtx.stage('teamComparison', teamComparison)
    batchCtx.stage('allyProfile', allyProfile)
    batchCtx.stage('enemyProfile', enemyProfile)
    batchCtx.commit()

    for (const puuid of allAllyPuuids) {
      const analysis = params.playerStats.players[puuid]
      if (analysis) {
        this._aggregationReducer.push(puuid, analysis.akariScore.total)
      }
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
      allyPuuids,
      enemyPuuids: params.enemyMembers,
      gameMode: params.gameMode,
      queueType: params.queueType,
      teamComparison,
      allyProfile,
      enemyProfile,
      currentGamePhase: gamePhase
    }

    const result = this._pipeline.execute(ctx)
    const sorted = result.advices.sort((a, b) => a.priority - b.priority)
    const deduped = this._deduplicateAdvices(sorted)

    this._scheduler.enqueue(deduped)

    this._layers.writeTruth(cacheKey, deduped)
    this._completeness.set(cacheKey, newCompleteness)
    this._refCounts.register(cacheKey)
    this._refCounts.retain(cacheKey)

    return deduped
  }

    pushOptimisticAdvices(key: string, advices: CoachAdvice[]): string {
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
      teams: Record<string, any>
    } | null
    allyMembers: string[]
    enemyMembers: string[]
    selfPuuid: string
  }): { allyAvgScore: number; enemyAvgScore: number; scoreDiff: number } | null {
    if (!params.playerStats) return null
    const allyPass = computeTeamScorePass(
      params.allyMembers.filter((p) => p !== params.selfPuuid),
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
    this._layers.clearAll()
    this._refCounts.clear()
    this._completeness.clear()
    this._scheduler.clear()
    this._aggregationReducer.clear()
    this._lastComparison = null
  }

    dispose() {
    this._refCounts.stopAutoGc()
    this.clearCache()
  }

  getScheduledAdvices(count: number): CoachAdvice[] {
    const scheduled = this._scheduler.dequeue(count)
    return scheduled.map((s) => s.advice)
  }

  peekScheduledAdvices(count: number): CoachAdvice[] {
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

    private _deduplicateAdvices(advices: CoachAdvice[]): CoachAdvice[] {
    const seen = new Map<string, CoachAdvice>()
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

export function createCoachEngine(schedulerConfig?: Partial<SchedulerConfig>): CoachEngine {
  return new CoachEngine(schedulerConfig)
}
