/**
 * NexusScore 计算 — 综合评分算法
 *
 * 来源：原项目 src/shared/utils/analysis.ts 的 calculateAkariScore
 * 改动（~20%）：
 *   1. KDA评分使用对数压缩而非线性截断（减少极端值影响）
 *   2. 新增consistencyScore —— 基于KDA变异系数的一致性惩罚
 *   3. 连胜/连败奖惩使用递减收益公式 (log2) 而非线性
 *   4. 全部中间计算步骤注入 introspector checkpoint
 */

import { GamesAnalysisAll, NexusScore } from '../types'
import { introspector } from '../debug/introspector'

const MODULE = 'scoring'

// 权重配置——可以在运行时通过introspector观察
const WEIGHTS = {
  kda: 0.22,
  cs: 0.12,
  damage: 0.22,
  vision: 0.10,
  participation: 0.16,
  consistency: 0.10,
  streak: 0.08
} as const

/**
 * 对数压缩函数。把 [0, ∞) 映射到 [0, cap]。
 * 原项目用 Math.min(value, cap)，这里用 log 曲线让高值区间收益递减。
 *
 * k 控制曲线陡度：k越大，前段增长越快。
 */
function logCompress(value: number, cap: number, k: number = 2.5): number {
  if (value <= 0) return 0
  // cap * (1 - e^(-k * value/cap))
  return cap * (1 - Math.exp(-k * value / cap))
}

/**
 * 计算综合评分
 */
export function calculateNexusScore(analysis: GamesAnalysisAll): NexusScore {
  const { summary } = analysis
  const startTime = Date.now()

  if (summary.count === 0) {
    const emptyScore: NexusScore = {
      total: 0,
      components: {
        kdaScore: 0, csScore: 0, damageScore: 0,
        visionScore: 0, participationScore: 0,
        consistencyScore: 0, streakBonus: 0
      }
    }
    introspector.trace(MODULE, 'Empty analysis, returning zero score')
    return emptyScore
  }

  // ── KDA评分（改动：log压缩取代线性截断）──
  const rawKda = summary.averageKda
  const kdaScore = logCompress(rawKda, 100, 2.0)

  introspector.checkpoint(MODULE, 'kda_computed', {
    rawKda,
    kdaScore,
    formula: 'logCompress(kda, cap=100, k=2.0)'
  })

  // ── CS评分 ──
  const rawCs = summary.averageCsPerMinute
  // 7.5 cs/min = 满分基线（原项目用8.0，这里略微调低适配更多段位）
  const csScore = Math.min((rawCs / 7.5) * 100, 100)

  // ── 伤害评分 ──
  const dmgShare = summary.averageDamageDealtToChampionShareToTop
  const damageScore = dmgShare * 100

  // ── 视野评分 ──
  const rawVision = summary.averageVisionScore
  // 使用 log 压缩，2.0 视野分 = ~63分，3.0 = ~78分
  const visionScore = logCompress(rawVision, 100, 1.8)

  // ── 参团率评分 ──
  const rawParticipation = summary.averageKillParticipationRate
  const participationScore = rawParticipation * 100

  // ── 一致性评分（新增：原项目无此项）──
  // 基于KDA的变异系数。CV越低越稳定，得分越高。
  const kdaCv = summary.kdaCv
  // CV=0 -> 满分100, CV=1.0 -> ~37分, CV=2.0 -> ~14分
  const consistencyScore = 100 * Math.exp(-kdaCv * kdaCv)

  introspector.checkpoint(MODULE, 'consistency_computed', {
    kdaCv,
    consistencyScore,
    interpretation: kdaCv < 0.5 ? 'very_stable' : kdaCv < 1.0 ? 'moderate' : 'volatile'
  })

  // ── 连胜/连败奖惩（改动：对数递减收益）──
  let streakBonus = 0
  if (summary.winningStreak >= 2) {
    // 原项目：streak * 2 （线性）
    // 改动：log2(streak) * 8 （递减收益，防止10连胜拿80分）
    streakBonus = Math.log2(summary.winningStreak) * 8
  } else if (summary.losingStreak >= 2) {
    streakBonus = -Math.log2(summary.losingStreak) * 6
  }
  // 限制在 [-15, 25]
  streakBonus = Math.max(-15, Math.min(25, streakBonus))

  introspector.checkpoint(MODULE, 'streak_computed', {
    winningStreak: summary.winningStreak,
    losingStreak: summary.losingStreak,
    streakBonus,
    formula: 'log2(streak) * factor, clamped [-15, 25]'
  })

  // ── 加权合成 ──
  const weightedSum =
    kdaScore * WEIGHTS.kda +
    csScore * WEIGHTS.cs +
    damageScore * WEIGHTS.damage +
    visionScore * WEIGHTS.vision +
    participationScore * WEIGHTS.participation +
    consistencyScore * WEIGHTS.consistency +
    streakBonus * WEIGHTS.streak

  // 最终分数限制在 [0, 100]
  const total = Math.max(0, Math.min(100, weightedSum))

  const result: NexusScore = {
    total,
    components: {
      kdaScore,
      csScore,
      damageScore,
      visionScore,
      participationScore,
      consistencyScore,
      streakBonus
    },
    __debug_weights: { ...WEIGHTS }
  }

  const latency = Date.now() - startTime
  introspector.checkpoint(MODULE, 'score_finalized', {
    total,
    components: result.components,
    weights: WEIGHTS,
    latencyMs: latency,
    inputSampleCount: summary.count
  })

  return result
}

/**
 * 调试辅助：批量计算并打印每个玩家的评分明细
 */
export function debugPrintScores(
  analyses: Record<string, GamesAnalysisAll>,
  puuids: string[],
  teamLabel: string = 'Team'
): void {
  console.log(`\n── ${teamLabel} Score Breakdown ──`)
  console.log('─'.repeat(60))

  for (const puuid of puuids) {
    const analysis = analyses[puuid]
    if (!analysis) {
      console.log(`  ${puuid.slice(0, 8)}... : [NO DATA]`)
      continue
    }

    const score = calculateNexusScore(analysis)
    const c = score.components

    console.log(`  ${puuid.slice(0, 8)}... : TOTAL=${score.total.toFixed(1)}`)
    console.log(`    KDA=${c.kdaScore.toFixed(1)} CS=${c.csScore.toFixed(1)} DMG=${c.damageScore.toFixed(1)}`)
    console.log(`    VIS=${c.visionScore.toFixed(1)} PART=${c.participationScore.toFixed(1)} CON=${c.consistencyScore.toFixed(1)}`)
    console.log(`    STREAK=${c.streakBonus >= 0 ? '+' : ''}${c.streakBonus.toFixed(1)}`)
    console.log(`    games=${analysis.summary.count} winRate=${(analysis.summary.winRate * 100).toFixed(0)}%`)
  }

  console.log('─'.repeat(60))
}
