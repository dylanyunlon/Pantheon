/**
 * 综合评分算法
 *
 * 移植自 upstream/src/core/scoring.ts (187行)
 * 改动 (~20%):
 *   1. 压缩函数从 1-e^(-kx) 换用 tanh(kx/cap)——同样0到cap收敛，但中段线性区更宽
 *   2. 权重在运行时做归一化（允许不精确配置，自动补偿到sum=1）
 *   3. 新增 debugBreakdown：一次性打印所有中间值和公式，像 printf 调试一样
 *   4. 用 StructWatcher 追踪连续评分调用之间的分数漂移
 */

import { GamesAnalysisAll, NexusScore } from '../types'
import { introspector, StructWatcher } from '../debug/introspector'

const MODULE = 'scoring'

// ── 权重配置 ──
const RAW_WEIGHTS = {
  kda: 0.22,
  cs: 0.12,
  damage: 0.22,
  vision: 0.10,
  participation: 0.16,
  consistency: 0.10,
  streak: 0.08
}

// 运行时归一化——即使配错权重也能work（改动）
function normalizeWeights(w: Record<string, number>): Record<string, number> {
  const sum = Object.values(w).reduce((s, v) => s + v, 0)
  if (sum === 0) return w
  const result: Record<string, number> = {}
  for (const [k, v] of Object.entries(w)) result[k] = v / sum
  return result
}

const WEIGHTS = normalizeWeights(RAW_WEIGHTS)

// StructWatcher 追踪评分漂移（新增）
const scoreWatcher = new StructWatcher<{ total: number; kda: number; cs: number; consistency: number }>('score_drift')

/**
 * 双曲正切压缩（改动：替换upstream的指数压缩）
 * tanh在原点附近几乎线性，比exp压缩在中段保留更多分辨率
 */
function tanhCompress(value: number, cap: number, steepness: number = 2.0): number {
  if (value <= 0) return 0
  return cap * Math.tanh(steepness * value / cap)
}

// ── 各项子分计算（独立导出，便于单元测试和断点调试）──

export function computeKDAScore(rawKda: number): number {
  return tanhCompress(rawKda, 100, 1.8)
}

export function computeConsistencyScore(kdaCv: number): number {
  // CV=0 满分, CV≥1.5 接近0（改动：使用双曲余弦衰减替换高斯）
  return 100 / Math.cosh(kdaCv * 1.4)
}

export function computeStreakBonus(winStreak: number, loseStreak: number): number {
  let bonus = 0
  if (winStreak >= 2) {
    bonus = Math.log2(winStreak) * 8
  } else if (loseStreak >= 2) {
    bonus = -Math.log2(loseStreak) * 6
  }
  return Math.max(-15, Math.min(25, bonus))
}

export function computeCSScore(csPerMin: number): number {
  return Math.min((csPerMin / 7.5) * 100, 100)
}

export function computeCompositePlayerScore(analysis: GamesAnalysisAll): NexusScore {
  const { summary } = analysis
  const t0 = Date.now()

  if (summary.count === 0) {
    introspector.trace(MODULE, 'Empty analysis → zero score')
    return {
      total: 0,
      components: { kdaScore: 0, csScore: 0, damageScore: 0, visionScore: 0, participationScore: 0, consistencyScore: 0, streakBonus: 0 }
    }
  }

  const kdaScore = computeKDAScore(summary.averageKda)
  const csScore = computeCSScore(summary.averageCsPerMinute)
  const damageScore = summary.averageDamageDealtToChampionShareToTop * 100
  const visionScore = tanhCompress(summary.averageVisionScore, 100, 1.6)
  const participationScore = summary.averageKillParticipationRate * 100
  const consistencyScore = computeConsistencyScore(summary.kdaCv)
  const streakBonus = computeStreakBonus(summary.winningStreak, summary.losingStreak)

  // ── 全部中间值一次性checkpoint（核心调试手段）──
  introspector.checkpoint(MODULE, 'components_computed', {
    rawKda: summary.averageKda,
    kdaScore: +kdaScore.toFixed(2),
    rawCs: summary.averageCsPerMinute,
    csScore: +csScore.toFixed(2),
    dmgShare: summary.averageDamageDealtToChampionShareToTop,
    damageScore: +damageScore.toFixed(2),
    rawVision: summary.averageVisionScore,
    visionScore: +visionScore.toFixed(2),
    rawParticipation: summary.averageKillParticipationRate,
    participationScore: +participationScore.toFixed(2),
    kdaCv: summary.kdaCv,
    consistencyScore: +consistencyScore.toFixed(2),
    winStreak: summary.winningStreak,
    loseStreak: summary.losingStreak,
    streakBonus: +streakBonus.toFixed(2),
    weights: WEIGHTS,
    formula: 'Σ(component × weight), tanh compression, weights auto-normalized'
  })

  const weightedSum =
    kdaScore * WEIGHTS.kda +
    csScore * WEIGHTS.cs +
    damageScore * WEIGHTS.damage +
    visionScore * WEIGHTS.vision +
    participationScore * WEIGHTS.participation +
    consistencyScore * WEIGHTS.consistency +
    streakBonus * WEIGHTS.streak

  const total = Math.max(0, Math.min(100, weightedSum))
  const computeMs = Date.now() - t0

  // StructWatcher：追踪连续调用之间的漂移（新增）
  const diffs = scoreWatcher.snap({ total: +total.toFixed(2), kda: +kdaScore.toFixed(2), cs: +csScore.toFixed(2), consistency: +consistencyScore.toFixed(2) })
  if (diffs.length > 0) {
    introspector.debug(MODULE, `Score drift detected: ${diffs.map(d => `${d.field} ${fmt(d.from)}→${fmt(d.to)}`).join(', ')}`)
  }

  return {
    total,
    components: { kdaScore, csScore, damageScore, visionScore, participationScore, consistencyScore, streakBonus },
    __debug_weights: { ...WEIGHTS },
    __dbg_computeMs: computeMs,
  }
}

function fmt(v: unknown): string {
  return typeof v === 'number' ? v.toFixed(2) : String(v)
}

// ── 调试辅助 ──

export function debugPrintScoringBreakdown(analysis: GamesAnalysisAll, label?: string): void {
  const score = computeCompositePlayerScore(analysis)
  const c = score.components
  const s = analysis.summary
  console.log(`\n── Scoring Breakdown${label ? ` (${label})` : ''} ──`)
  console.log(`  Input:  ${s.count} games, WR=${(s.winRate*100).toFixed(0)}%, KDA=${s.averageKda.toFixed(2)}, CS/min=${s.averageCsPerMinute.toFixed(1)}`)
  console.log(`  KDA:    raw=${s.averageKda.toFixed(2)} → tanh → ${c.kdaScore.toFixed(1)}  (weight ${(WEIGHTS.kda*100).toFixed(0)}%)`)
  console.log(`  CS:     raw=${s.averageCsPerMinute.toFixed(1)} → linear → ${c.csScore.toFixed(1)}  (weight ${(WEIGHTS.cs*100).toFixed(0)}%)`)
  console.log(`  DMG:    share=${s.averageDamageDealtToChampionShareToTop.toFixed(3)} → ${c.damageScore.toFixed(1)}  (weight ${(WEIGHTS.damage*100).toFixed(0)}%)`)
  console.log(`  VIS:    raw=${s.averageVisionScore.toFixed(2)} → tanh → ${c.visionScore.toFixed(1)}  (weight ${(WEIGHTS.vision*100).toFixed(0)}%)`)
  console.log(`  PART:   rate=${s.averageKillParticipationRate.toFixed(3)} → ${c.participationScore.toFixed(1)}  (weight ${(WEIGHTS.participation*100).toFixed(0)}%)`)
  console.log(`  CONSIST:cv=${s.kdaCv.toFixed(3)} → 1/cosh → ${c.consistencyScore.toFixed(1)}  (weight ${(WEIGHTS.consistency*100).toFixed(0)}%)`)
  console.log(`  STREAK: W${s.winningStreak}/L${s.losingStreak} → ${c.streakBonus >= 0 ? '+' : ''}${c.streakBonus.toFixed(1)}  (weight ${(WEIGHTS.streak*100).toFixed(0)}%)`)
  console.log(`  ────────────────────`)
  console.log(`  TOTAL:  ${score.total.toFixed(1)} / 100  (${score.__dbg_computeMs}ms)`)
}
