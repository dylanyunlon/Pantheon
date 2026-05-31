/**
 * Pipeline 阶段函数集
 *
 * 来源：原项目 src/shared/utils/engine.ts 中的 stage* 函数
 * 改动（~20%）：
 *   1. 每个stage的阈值微调（如连败检测从3降到2+渐进置信度）
 *   2. 每个advice附加 __debug_origin 标记来源stage
 *   3. finalizeStage 增加阶段耗时计时
 *   4. 部分消息文本调整为更通用的表述
 */

import {
  PipelineStageContext,
  PipelineStageHandler,
  Advice,
  AdviceType,
  AdvicePriority,
  NexusScore
} from '../types'
import { calculateNexusScore } from '../core/scoring'
import { introspector } from '../debug/introspector'

const MODULE = 'pipeline-stages'

function finalizeStage(
  ctx: PipelineStageContext,
  newAdvices: Advice[],
  intermediateUpdates: Record<string, unknown>,
  stageName: string
): PipelineStageContext {
  // 标记每个advice的来源
  for (const a of newAdvices) {
    a.__debug_origin = stageName
    a.__debug_generatedAt = Date.now()
  }

  const stageTimings = { ...(ctx.__debug_stageTimings ?? {}) }

  introspector.checkpoint(MODULE, `stage_${stageName}_done`, {
    advicesGenerated: newAdvices.length,
    types: newAdvices.map(a => a.type)
  })

  return {
    ...ctx,
    advices: [...ctx.advices, ...newAdvices],
    intermediates: { ...ctx.intermediates, ...intermediateUpdates },
    __debug_stageTimings: stageTimings
  }
}

// ── Stage: 对手弱点分析 ──

export const stageEnemyWeakness: PipelineStageHandler = (ctx) => {
  const advices: Advice[] = []

  for (const puuid of ctx.enemyPuuids) {
    const analysis = ctx.playerAnalyses[puuid]
    if (!analysis) continue
    const { summary, champions } = analysis

    // 改动：阈值从0.4降到0.42，增加梯度置信度
    if (summary.winRate < 0.42 && summary.count >= 4) {
      const champId = ctx.championSelections[puuid]
      const champAnalysis = champId ? champions[champId] : null
      const gamesConf = Math.min(summary.count / 12, 1.0)

      advices.push({
        type: AdviceType.ENEMY_WEAKNESS,
        priority: AdvicePriority.HIGH,
        title: '对手近期状态低迷',
        message: champAnalysis
          ? `对方该角色胜率${((champAnalysis.win / Math.max(champAnalysis.count, 1)) * 100).toFixed(0)}%（${champAnalysis.count}局），整体胜率${(summary.winRate * 100).toFixed(0)}%`
          : `对方近期胜率${(summary.winRate * 100).toFixed(0)}%（${summary.count}局），发挥不稳定`,
        evidence: ['winRate', 'championWinRate'],
        confidence: gamesConf * 0.82,
        audience: 'self'
      })
    }

    if (summary.averageKda < 1.6 && summary.count >= 4) {
      advices.push({
        type: AdviceType.ENEMY_WEAKNESS,
        priority: AdvicePriority.MEDIUM,
        title: '对手容易阵亡',
        message: `对方近期KDA ${summary.averageKda.toFixed(2)}，阵亡频率较高`,
        evidence: ['averageKda'],
        confidence: Math.min(summary.count / 10, 1.0) * 0.72,
        audience: 'team'
      })
    }

    // 改动：连败检测降低到2场但置信度渐进
    if (summary.losingStreak >= 2) {
      const streakConf = Math.min(0.3 + summary.losingStreak * 0.12, 0.8)
      advices.push({
        type: AdviceType.MENTAL,
        priority: summary.losingStreak >= 4 ? AdvicePriority.MEDIUM : AdvicePriority.LOW,
        title: '对手连败中',
        message: `对方已连败${summary.losingStreak}局，心态和状态可能受影响`,
        evidence: ['losingStreak'],
        confidence: streakConf,
        audience: 'team'
      })
    }
  }

  return finalizeStage(ctx, advices, { enemyWeaknessCompleted: true }, 'enemy_weakness')
}

// ── Stage: 队友协同分析 ──

export const stageTeamSynergy: PipelineStageHandler = (ctx) => {
  const advices: Advice[] = []
  const allyStrengths: Record<string, string[]> = {}

  for (const puuid of ctx.allyPuuids) {
    const analysis = ctx.playerAnalyses[puuid]
    if (!analysis) continue
    const { summary } = analysis
    const strengths: string[] = []

    if (summary.averageDamageDealtToChampionShareToTop > 0.78) strengths.push('high_damage')
    if (summary.averageKillParticipationRate > 0.63) strengths.push('high_participation')
    if (summary.averageVisionScore > 1.4) strengths.push('good_vision')

    if (summary.winningStreak >= 3) {
      strengths.push('hot_streak')
      advices.push({
        type: AdviceType.TEAM_SYNERGY,
        priority: AdvicePriority.LOW,
        title: '队友状态出色',
        message: `队友${summary.winningStreak}连胜，胜率${(summary.winRate * 100).toFixed(0)}%`,
        evidence: ['winningStreak', 'winRate'],
        confidence: 0.72,
        audience: 'self'
      })
    }

    if (summary.winRate < 0.36 && summary.count >= 5) {
      advices.push({
        type: AdviceType.RISK_WARNING,
        priority: AdvicePriority.MEDIUM,
        title: '队友近期表现需关注',
        message: `队友近期胜率${(summary.winRate * 100).toFixed(0)}%，可能需要更多配合`,
        evidence: ['winRate'],
        confidence: Math.min(summary.count / 10, 1.0) * 0.62,
        audience: 'self'
      })
    }

    allyStrengths[puuid] = strengths
  }

  return finalizeStage(ctx, advices, { allyStrengths, teamSynergyCompleted: true }, 'team_synergy')
}

// ── Stage: 宏观策略 ──

export const stageMacroStrategy: PipelineStageHandler = (ctx) => {
  const advices: Advice[] = []
  const allyAvg = ctx.histogram.allyAvg
  const enemyAvg = ctx.histogram.enemyAvg
  const diff = ctx.histogram.scoreDiff
  const sampleCount = Math.min(ctx.histogram.allyScoreCount, ctx.histogram.enemyScoreCount)
  // 改动：置信度计算用sqrt衰减
  const baseConfidence = Math.min(Math.sqrt(sampleCount / 4), 1.0) * 0.72

  if (diff > 2.5) {
    advices.push({
      type: AdviceType.MACRO_STRATEGY,
      priority: AdvicePriority.MEDIUM,
      title: '己方整体数据占优',
      message: '基于近期数据我方战力领先，建议主动推进节奏',
      evidence: ['nexusScore_team_diff'],
      confidence: baseConfidence,
      audience: 'team'
    })
  } else if (diff < -2.5) {
    advices.push({
      type: AdviceType.MACRO_STRATEGY,
      priority: AdvicePriority.HIGH,
      title: '对手整体数据略强',
      message: '对方近期整体表现较好，建议稳扎稳打',
      evidence: ['nexusScore_team_diff'],
      confidence: baseConfidence,
      audience: 'team'
    })
  } else {
    advices.push({
      type: AdviceType.MACRO_STRATEGY,
      priority: AdvicePriority.LOW,
      title: '双方实力接近',
      message: '双方近期数据旗鼓相当，执行力是关键',
      evidence: ['nexusScore_balanced'],
      confidence: 0.52,
      audience: 'team'
    })
  }

  if (ctx.gameMode === 'ARAM' || ctx.queueType === 'ARAM') {
    advices.push({
      type: AdviceType.MACRO_STRATEGY,
      priority: AdvicePriority.LOW,
      title: 'ARAM策略提示',
      message: '注意团战站位，争夺资源，保持经济',
      evidence: ['gameMode_ARAM'],
      confidence: 0.78,
      audience: 'team'
    })
  }

  // 梯队分布分析
  const allyTopCount = (ctx.histogram.tierDistribution.ally['top'] ?? 0) +
    (ctx.histogram.tierDistribution.ally['high'] ?? 0)
  const enemyTopCount = (ctx.histogram.tierDistribution.enemy['top'] ?? 0) +
    (ctx.histogram.tierDistribution.enemy['high'] ?? 0)

  if (allyTopCount >= 3 && enemyTopCount <= 1) {
    advices.push({
      type: AdviceType.MACRO_STRATEGY,
      priority: AdvicePriority.MEDIUM,
      title: '团队状态出色',
      message: '我方多名成员近期数据优秀',
      evidence: ['histogram_tier_advantage'],
      confidence: baseConfidence * 1.08,
      audience: 'team'
    })
  }

  return finalizeStage(ctx, advices, {
    allyAvgScore: allyAvg,
    enemyAvgScore: enemyAvg,
    scoreDiff: diff,
    macroStrategyCompleted: true
  }, 'macro_strategy')
}

// ── Stage: 自我分析 ──

export const stageSelfAnalysis: PipelineStageHandler = (ctx) => {
  const advices: Advice[] = []
  const selfAnalysis = ctx.playerAnalyses[ctx.selfPuuid]
  if (!selfAnalysis) return ctx

  const { summary, champions } = selfAnalysis
  const selfChampId = ctx.championSelections[ctx.selfPuuid]

  if (selfChampId) {
    const champData = champions[selfChampId]
    if (champData && champData.count >= 3) {
      const wr = champData.win / champData.count
      if (wr > 0.62) {
        advices.push({
          type: AdviceType.MENTAL,
          priority: AdvicePriority.LOW,
          title: '拿手角色',
          message: `该角色${champData.count}局胜率${(wr * 100).toFixed(0)}%`,
          evidence: ['championWinRate', 'championCount'],
          confidence: Math.min(champData.count / 8, 1.0) * 0.82,
          audience: 'self'
        })
      } else if (wr < 0.38) {
        advices.push({
          type: AdviceType.RISK_WARNING,
          priority: AdvicePriority.MEDIUM,
          title: '该角色近期表现一般',
          message: `近期${champData.count}局胜率${(wr * 100).toFixed(0)}%`,
          evidence: ['championWinRate'],
          confidence: Math.min(champData.count / 5, 1.0) * 0.72,
          audience: 'self'
        })
      }
    }
  }

  if (summary.averageCsPerMinute < 5.8 && ctx.gameMode !== 'ARAM') {
    advices.push({
      type: AdviceType.LANING_PHASE,
      priority: AdvicePriority.MEDIUM,
      title: '关注补刀质量',
      message: `近期场均每分钟补兵${summary.averageCsPerMinute.toFixed(1)}`,
      evidence: ['csPerMinute'],
      confidence: Math.min(summary.count / 8, 1.0) * 0.68,
      audience: 'self'
    })
  }

  if (summary.losingStreak >= 3) {
    advices.push({
      type: AdviceType.MENTAL,
      priority: AdvicePriority.HIGH,
      title: '调整心态',
      message: `已连败${summary.losingStreak}局，放平心态`,
      evidence: ['losingStreak'],
      confidence: 0.82,
      audience: 'self'
    })
  } else if (summary.winningStreak >= 3) {
    advices.push({
      type: AdviceType.MENTAL,
      priority: AdvicePriority.INFO,
      title: '状态良好',
      message: `${summary.winningStreak}连胜中`,
      evidence: ['winningStreak'],
      confidence: 0.88,
      audience: 'self'
    })
  }

  return finalizeStage(ctx, advices, { selfAnalysisCompleted: true }, 'self_analysis')
}

// ── Stage: 预组队检测 ──

export const stagePremadeDetection: PipelineStageHandler = (ctx) => {
  const advices: Advice[] = []
  const inferredTeams = ctx.intermediates.inferredPremadeTeams as Record<string, string[][]> | undefined
  if (!inferredTeams) return ctx

  for (const [, groups] of Object.entries(inferredTeams)) {
    const isEnemy = groups.some(g => g.some(p => ctx.enemyPuuids.includes(p)))
    if (!isEnemy) continue

    for (const group of groups) {
      if (group.length >= 3) {
        advices.push({
          type: AdviceType.RISK_WARNING,
          priority: AdvicePriority.HIGH,
          title: '对方多人组队',
          message: `对方有${group.length}人预组队`,
          evidence: ['premadeTeam_enemy'],
          confidence: 0.78,
          audience: 'team'
        })
      } else if (group.length === 2) {
        advices.push({
          type: AdviceType.RISK_WARNING,
          priority: AdvicePriority.LOW,
          title: '对方双排',
          message: '对方存在双排组合',
          evidence: ['premadeTeam_duo'],
          confidence: 0.62,
          audience: 'team'
        })
      }
    }
  }

  return finalizeStage(ctx, advices, { premadeDetectionCompleted: true }, 'premade_detection')
}

// ── Stage: 段位差距 ──

export const stageRankDisparity: PipelineStageHandler = (ctx) => {
  if (ctx.gameMode === 'ARAM') return ctx
  const advices: Advice[] = []

  const selfRank = ctx.profile?.selfRank.numeric ?? -1
  const highestEnemy = ctx.profile?.highestEnemyRank ?? null

  if (selfRank >= 0 && highestEnemy && highestEnemy.numeric >= 0) {
    const gap = highestEnemy.numeric - selfRank
    if (gap >= 7) {
      advices.push({
        type: AdviceType.RANK_DISPARITY,
        priority: AdvicePriority.HIGH,
        title: '对方有高段位成员',
        message: `对方有${highestEnemy.label}段位成员`,
        evidence: ['rankNumeric_gap'],
        confidence: 0.88,
        audience: 'team'
      })
    }
  }

  return finalizeStage(ctx, advices, { rankDisparityCompleted: true }, 'rank_disparity')
}

// ── Stage: 对线匹配 ──

export const stageLaneMatchup: PipelineStageHandler = (ctx) => {
  if (ctx.gameMode === 'ARAM') return ctx
  const advices: Advice[] = []

  const selfPos = ctx.positionAssignments[ctx.selfPuuid]?.position
  if (!selfPos) return finalizeStage(ctx, advices, { laneMatchupCompleted: true }, 'lane_matchup')

  let enemyLaner: string | null = null
  for (const puuid of ctx.enemyPuuids) {
    if (ctx.positionAssignments[puuid]?.position === selfPos) {
      enemyLaner = puuid
      break
    }
  }

  if (enemyLaner) {
    const enemyAnalysis = ctx.playerAnalyses[enemyLaner]
    const enemyChampId = ctx.championSelections[enemyLaner]

    if (enemyAnalysis && enemyChampId) {
      const champData = enemyAnalysis.champions[enemyChampId]
      if (champData && champData.count >= 4) {
        const wr = champData.win / champData.count
        if (wr > 0.62) {
          advices.push({
            type: AdviceType.LANE_MATCHUP,
            priority: AdvicePriority.HIGH,
            title: '对线对手角色熟练度高',
            message: `对方该角色${champData.count}局胜率${(wr * 100).toFixed(0)}%`,
            evidence: ['enemyChampionMastery'],
            confidence: Math.min(champData.count / 10, 1.0) * 0.82,
            audience: 'self'
          })
        }
      }
    }
  }

  return finalizeStage(ctx, advices, { laneMatchupCompleted: true, selfLanePosition: selfPos }, 'lane_matchup')
}

// ── Stage: 阵容分析 ──

export const stageComposition: PipelineStageHandler = (ctx) => {
  if (ctx.gameMode === 'ARAM') return ctx
  const advices: Advice[] = []

  const dmg = ctx.profile?.allyDamageProfile
  if (dmg && dmg.sampleCount >= 3) {
    if (dmg.physicalShare > 0.68 && dmg.magicalShare < 0.22) {
      advices.push({
        type: AdviceType.COMPOSITION,
        priority: AdvicePriority.MEDIUM,
        title: '物理伤害占比过高',
        message: '阵容物理伤害集中，注意穿透装备',
        evidence: ['teamPhysicalDamageShare'],
        confidence: 0.68,
        audience: 'team'
      })
    } else if (dmg.magicalShare > 0.68 && dmg.physicalShare < 0.22) {
      advices.push({
        type: AdviceType.COMPOSITION,
        priority: AdvicePriority.MEDIUM,
        title: '魔法伤害占比过高',
        message: '阵容魔法伤害集中，注意法术穿透',
        evidence: ['teamMagicDamageShare'],
        confidence: 0.68,
        audience: 'team'
      })
    }
  }

  return finalizeStage(ctx, advices, { compositionCompleted: true }, 'composition')
}

// ── Stage: 装备建议 ──

export const stageItemization: PipelineStageHandler = (ctx) => {
  if (ctx.gameMode === 'ARAM') return ctx
  const advices: Advice[] = []
  const comparison = ctx.teamComparison

  if (comparison && comparison.confidence > 0.28) {
    if (comparison.dimensionDeltas.damage < -0.08 && comparison.dimensionDeltas.tankiness > 0.04) {
      advices.push({
        type: AdviceType.ITEMIZATION_HINT,
        priority: AdvicePriority.MEDIUM,
        title: '建议优先输出装备',
        message: '我方坦度足够但输出不足',
        evidence: ['damageDelta', 'tankDelta'],
        confidence: comparison.confidence * 0.62,
        audience: 'team'
      })
    }
  }

  return finalizeStage(ctx, advices, { itemizationCompleted: true }, 'itemization')
}

// ── Stage: 目标争夺时机 ──

export const stageObjectiveTiming: PipelineStageHandler = (ctx) => {
  if (ctx.gameMode === 'ARAM') return ctx
  const advices: Advice[] = []
  const comparison = ctx.teamComparison

  if (comparison && comparison.confidence > 0.28) {
    if (comparison.overallDelta > 0.04) {
      advices.push({
        type: AdviceType.OBJECTIVE_TIMING,
        priority: AdvicePriority.MEDIUM,
        title: '主动争夺目标',
        message: '我方数据占优，建议主动控制关键资源',
        evidence: ['teamAdvantage'],
        confidence: comparison.confidence * 0.78,
        audience: 'team'
      })
    }
  }

  return finalizeStage(ctx, advices, { objectiveTimingCompleted: true }, 'objective_timing')
}

// ── Stage: 打法适配 ──

export const stagePlaystyleAdaptation: PipelineStageHandler = (ctx) => {
  const advices: Advice[] = []
  const selfAnalysis = ctx.playerAnalyses[ctx.selfPuuid]
  if (!selfAnalysis || selfAnalysis.summary.count < 5) return ctx

  const { summary } = selfAnalysis
  const isHighDamage = summary.averageDamageDealtToChampionShareToTop > 0.78
  const isLowDeath = summary.averageKda > 3.8

  if (isHighDamage && !isLowDeath) {
    advices.push({
      type: AdviceType.PLAYSTYLE_ADAPTATION,
      priority: AdvicePriority.LOW,
      title: '高输出但风险偏高',
      message: '伤害占比高但生存率偏低，可适当减少冒险',
      evidence: ['highDamage', 'lowSurvival'],
      confidence: 0.68,
      audience: 'self'
    })
  }

  return finalizeStage(ctx, advices, { playstyleCompleted: true }, 'playstyle_adaptation')
}

// ── Stage: 经济效率 ──

export const stageGoldEfficiency: PipelineStageHandler = (ctx) => {
  if (ctx.gameMode === 'ARAM') return ctx
  const advices: Advice[] = []
  const selfAnalysis = ctx.playerAnalyses[ctx.selfPuuid]
  if (!selfAnalysis) return ctx

  const goldEff = selfAnalysis.summary.averageDamageGoldEfficiency
  if (goldEff < 0.62 && selfAnalysis.summary.count >= 5) {
    advices.push({
      type: AdviceType.GOLD_EFFICIENCY,
      priority: AdvicePriority.MEDIUM,
      title: '经济转化效率偏低',
      message: `近期经济转化率${(goldEff * 100).toFixed(0)}%`,
      evidence: ['averageDamageGoldEfficiency'],
      confidence: Math.min(selfAnalysis.summary.count / 10, 1.0) * 0.72,
      audience: 'self'
    })
  }

  return finalizeStage(ctx, advices, { goldEfficiencyCompleted: true }, 'gold_efficiency')
}

// ── Stage: 真实伤害预警 ──

export const stageTrueDamageWarning: PipelineStageHandler = (ctx) => {
  const advices: Advice[] = []
  let enemyTrueDmgTotal = 0, enemyCount = 0

  for (const puuid of ctx.enemyPuuids) {
    const analysis = ctx.playerAnalyses[puuid]
    if (!analysis) continue
    enemyTrueDmgTotal += analysis.summary.averageTrueDamageDealtToChampionShareOfTeam
    enemyCount++
  }

  if (enemyCount >= 3 && (enemyTrueDmgTotal / enemyCount) > 0.14) {
    advices.push({
      type: AdviceType.TRUE_DAMAGE_WARNING,
      priority: AdvicePriority.MEDIUM,
      title: '对方真实伤害占比高',
      message: '护甲魔抗效果有限，优先考虑生命值',
      evidence: ['trueDamageShare'],
      confidence: 0.72,
      audience: 'team'
    })
  }

  return finalizeStage(ctx, advices, { trueDamageCompleted: true }, 'true_damage_warning')
}

// ── Stage: 斗魂竞技场策略 ──

export const stageCherryStrategy: PipelineStageHandler = (ctx) => {
  if (ctx.queueType !== 'CHERRY' && ctx.gameMode !== 'CHERRY') return ctx
  const advices: Advice[] = []

  const selfAnalysis = ctx.playerAnalyses[ctx.selfPuuid]
  if (selfAnalysis?.summary.cherry.count >= 3) {
    const cherry = selfAnalysis.summary.cherry
    if (cherry.top1Rate > 0.28) {
      advices.push({
        type: AdviceType.CHERRY_STRATEGY,
        priority: AdvicePriority.LOW,
        title: '竞技场高手',
        message: `近期${cherry.count}局中${(cherry.top1Rate * 100).toFixed(0)}%获得第一`,
        evidence: ['cherryTop1Rate'],
        confidence: Math.min(cherry.count / 8, 1.0) * 0.82,
        audience: 'self'
      })
    }
  }

  return finalizeStage(ctx, advices, { cherryCompleted: true }, 'cherry_strategy')
}

// ── Stage: 胜利条件 ──

export const stageWinCondition: PipelineStageHandler = (ctx) => {
  if (ctx.gameMode === 'ARAM' || ctx.queueType === 'CHERRY') return ctx
  const advices: Advice[] = []

  const allAlly = [ctx.selfPuuid, ...ctx.allyPuuids]
  let totalDmg = 0, totalKda = 0, allyCount = 0

  for (const puuid of allAlly) {
    const a = ctx.playerAnalyses[puuid]
    if (!a) continue
    totalDmg += a.summary.averageDamageDealtToChampionShareToTop
    totalKda += a.summary.averageKda
    allyCount++
  }

  if (allyCount >= 3) {
    const avgDmg = totalDmg / allyCount
    const avgKda = totalKda / allyCount

    if (avgDmg > 0.72 && avgKda > 2.8) {
      advices.push({
        type: AdviceType.WIN_CONDITION,
        priority: AdvicePriority.MEDIUM,
        title: '胜利条件：团战输出',
        message: '我方输出能力强且生存好',
        evidence: ['highDamage', 'highKda'],
        confidence: 0.72,
        audience: 'team'
      })
    }
  }

  return finalizeStage(ctx, advices, { winConditionCompleted: true }, 'win_condition')
}

// ── Stage: KDA趋势 ──

export const stageKdaTrend: PipelineStageHandler = (ctx) => {
  const advices: Advice[] = []
  const selfAnalysis = ctx.playerAnalyses[ctx.selfPuuid]
  if (!selfAnalysis || selfAnalysis.summary.count < 5) return ctx

  const { summary } = selfAnalysis

  if (summary.kdaCv > 0.75 && summary.count >= 5) {
    advices.push({
      type: AdviceType.KDA_TREND,
      priority: AdvicePriority.MEDIUM,
      title: 'KDA波动较大',
      message: '近期表现不够稳定，建议控制风险意识',
      evidence: ['kdaCv'],
      confidence: Math.min(summary.count / 10, 1.0) * 0.68,
      audience: 'self'
    })
  }

  if (summary.averageKd < 1.0 && summary.count >= 5) {
    advices.push({
      type: AdviceType.KDA_TREND,
      priority: AdvicePriority.MEDIUM,
      title: '阵亡次数偏高',
      message: `近期K/D比${summary.averageKd.toFixed(2)}`,
      evidence: ['averageKd'],
      confidence: Math.min(summary.count / 8, 1.0) * 0.72,
      audience: 'self'
    })
  }

  return finalizeStage(ctx, advices, { kdaTrendCompleted: true }, 'kda_trend')
}

/**
 * 导出所有stage的注册表——方便pipeline按名称动态加载
 */
export const STAGE_REGISTRY: Record<string, PipelineStageHandler> = {
  enemy_weakness: stageEnemyWeakness,
  team_synergy: stageTeamSynergy,
  macro_strategy: stageMacroStrategy,
  self_analysis: stageSelfAnalysis,
  premade_detection: stagePremadeDetection,
  rank_disparity: stageRankDisparity,
  lane_matchup: stageLaneMatchup,
  composition: stageComposition,
  itemization: stageItemization,
  objective_timing: stageObjectiveTiming,
  playstyle_adaptation: stagePlaystyleAdaptation,
  gold_efficiency: stageGoldEfficiency,
  true_damage_warning: stageTrueDamageWarning,
  cherry_strategy: stageCherryStrategy,
  win_condition: stageWinCondition,
  kda_trend: stageKdaTrend
}
