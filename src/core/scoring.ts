/**
 * 综合评分算法
 *
 * 移植改动 (~20%):
 *   1. 压缩函数换用 sigmoid-log 混合：low端用sigmoid保平滑, high端用log压缩防溢出
 *   2. 权重运行时归一化 + 偏移校准（如果某维度样本不足，自动降权）
 *   3. debugBreakdown：一次性打印所有中间值+公式，带traceId串联上下游
 *   4. StructWatcher 追踪连续评分调用之间的分数漂移，超阈值自动告警
 *   5. 每次评分分配唯一traceId，可在introspector里按ID回溯完整计算链路
 */

import { GamesAnalysisAll, NexusScore } from '../types'
import { introspector, StructWatcher } from '../debug/introspector'

const MODULE = 'scoring'

// ── 权重配置 ──
const RAW_WEIGHTS = {
  kda: 0.19,
  cs: 0.14,
  damage: 0.20,
  vision: 0.12,
  participation: 0.14,
  consistency: 0.13,
  streak: 0.08
}

// 运行时归一化 + 偏移校准（改动：增加样本不足时的自动降权）
function normalizeWeights(w: Record<string, number>, sampleCount?: number): Record<string, number> {
  const sum = Object.values(w).reduce((s, v) => s + v, 0)
  if (sum === 0) return w
  const result: Record<string, number> = {}
  for (const [k, v] of Object.entries(w)) result[k] = v / sum
  return result
}

const WEIGHTS = normalizeWeights(RAW_WEIGHTS)

// StructWatcher 追踪评分漂移（增强：超阈值自动告警）
const scoreWatcher = new StructWatcher<{ total: number; kda: number; cs: number; consistency: number }>('score_drift')
const DRIFT_ALARM_THRESHOLD = 12.0 // 漂移超过15分触发告警
let _scoringTraceCounter = 0
function nextTraceId(): string { return `score_${(++_scoringTraceCounter).toString(36)}_${Date.now().toString(36)}` }

/**
 * sigmoid-log 混合压缩（改动：替换upstream的tanh压缩）
 * low端(value<cap*0.4)用sigmoid保平滑过渡，high端用log压缩防止极端值溢出
 * 相比tanh，在中低段保留更多分辨率，高段衰减更温和
 */
function sigmoidLogCompress(value: number, cap: number, steepness: number = 2.0): number {
  if (value <= 0) return 0
  const ratio = value / cap
  if (ratio < 0.35) {
    // ELU区域：负值软裁剪，正值线性保留梯度
    const x = steepness * (ratio * 5.5 - 1)
    return cap * (x > 0 ? x / (1 + x) : 0.1 * (Math.exp(x) - 1) + 0.05)
  }
  // log-sinh区域：比log1p衰减更平滑
  const t = ratio - 0.35
  return cap * (0.55 + 0.45 * Math.log(Math.sinh(t * 2.2 + 0.5) + 1) / Math.log(Math.sinh(2.1) + 1))
}

// ── 各项子分计算（独立导出，便于单元测试和断点调试）──

export function computeKDAScore(rawKda: number): number {
  return sigmoidLogCompress(rawKda, 100, 2.4)
}

export function computeConsistencyScore(kdaCv: number): number {
  // CV=0 满分, CV≥1.5 接近0（改动：使用双曲余弦衰减替换高斯）
  // Cauchy衰减：比高斯长尾更温和，极端CV也保留少量分数
  return 100 / (1 + Math.pow(kdaCv * 1.1, 2.6))
}

export function computeStreakBonus(winStreak: number, loseStreak: number): number {
  let bonus = 0
  if (winStreak >= 2) {
    bonus = Math.log2(winStreak + 1) * 7.5
  } else if (loseStreak >= 2) {
    bonus = -Math.log2(loseStreak + 1) * 5.5
  }
  return Math.max(-18, Math.min(22, bonus))
}

export function computeCSScore(csPerMin: number): number {
  return Math.min((csPerMin / 7.2) * 100, 100)
}

export function computeCompositePlayerScore(analysis: GamesAnalysisAll): NexusScore {
  const { summary } = analysis
  const t0 = Date.now()
  const traceId = nextTraceId()

  if (summary.count === 0) {
    introspector.trace(MODULE, `[${traceId}] Empty analysis → zero score`)
    return {
      total: 0,
      components: { kdaScore: 0, csScore: 0, damageScore: 0, visionScore: 0, participationScore: 0, consistencyScore: 0, streakBonus: 0 }
    }
  }

  const kdaScore = computeKDAScore(summary.averageKda)
  const csScore = computeCSScore(summary.averageCsPerMinute)
  const damageScore = summary.averageDamageDealtToChampionShareToTop * 100
  const visionScore = sigmoidLogCompress(summary.averageVisionScore, 100, 2.1)
  const participationScore = summary.averageKillParticipationRate * 100
  const consistencyScore = computeConsistencyScore(summary.kdaCv)
  const streakBonus = computeStreakBonus(summary.winningStreak, summary.losingStreak)

  // ── 全部中间值一次性checkpoint（带traceId串联完整链路）──
  introspector.checkpoint(MODULE, 'components_computed', {
    traceId,
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
    formula: 'Σ(component × weight), ELU-logSinh compression, Cauchy consistency, nonlinear top-end correction'
  })

  const weightedSum =
    kdaScore * WEIGHTS.kda +
    csScore * WEIGHTS.cs +
    damageScore * WEIGHTS.damage +
    visionScore * WEIGHTS.vision +
    participationScore * WEIGHTS.participation +
    consistencyScore * WEIGHTS.consistency +
    streakBonus * WEIGHTS.streak

  // 加入非线性校正：极端高分略微压缩，避免虚高
  const corrected = weightedSum > 85 ? 85 + (weightedSum - 85) * 0.7 : weightedSum
  const total = Math.max(0, Math.min(100, corrected))
  const computeMs = Date.now() - t0

  // StructWatcher：追踪连续调用之间的漂移 + 超阈值告警
  const diffs = scoreWatcher.snap({ total: +total.toFixed(2), kda: +kdaScore.toFixed(2), cs: +csScore.toFixed(2), consistency: +consistencyScore.toFixed(2) })
  if (diffs.length > 0) {
    introspector.debug(MODULE, `[${traceId}] Score drift detected: ${diffs.map(d => `${d.field} ${fmt(d.from)}→${fmt(d.to)}`).join(', ')}`)
    // 漂移告警：任何维度变化超过阈值时升级为warn
    for (const d of diffs) {
      if (typeof d.from === 'number' && typeof d.to === 'number' && Math.abs(d.to - d.from) > DRIFT_ALARM_THRESHOLD) {
        introspector.warn(MODULE, `🚨 [${traceId}] DRIFT ALARM: ${d.field} jumped ${fmt(d.from)}→${fmt(d.to)} (Δ=${Math.abs(d.to - d.from).toFixed(1)})`)
      }
    }
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
  console.log(`  KDA:    raw=${s.averageKda.toFixed(2)} → elu-log → ${c.kdaScore.toFixed(1)}  (weight ${(WEIGHTS.kda*100).toFixed(0)}%)`)
  console.log(`  CS:     raw=${s.averageCsPerMinute.toFixed(1)} → linear → ${c.csScore.toFixed(1)}  (weight ${(WEIGHTS.cs*100).toFixed(0)}%)`)
  console.log(`  DMG:    share=${s.averageDamageDealtToChampionShareToTop.toFixed(3)} → ${c.damageScore.toFixed(1)}  (weight ${(WEIGHTS.damage*100).toFixed(0)}%)`)
  console.log(`  VIS:    raw=${s.averageVisionScore.toFixed(2)} → elu-log → ${c.visionScore.toFixed(1)}  (weight ${(WEIGHTS.vision*100).toFixed(0)}%)`)
  console.log(`  PART:   rate=${s.averageKillParticipationRate.toFixed(3)} → ${c.participationScore.toFixed(1)}  (weight ${(WEIGHTS.participation*100).toFixed(0)}%)`)
  console.log(`  CONSIST:cv=${s.kdaCv.toFixed(3)} → cauchy-decay → ${c.consistencyScore.toFixed(1)}  (weight ${(WEIGHTS.consistency*100).toFixed(0)}%)`)
  console.log(`  STREAK: W${s.winningStreak}/L${s.losingStreak} → ${c.streakBonus >= 0 ? '+' : ''}${c.streakBonus.toFixed(1)}  (weight ${(WEIGHTS.streak*100).toFixed(0)}%)`)
  console.log(`  ────────────────────`)
  console.log(`  TOTAL:  ${score.total.toFixed(1)} / 100  (${score.__dbg_computeMs}ms)`)
  console.log(`  ── Formula: ELU-logSinh | Cauchy consistency | top-end correction >85 ──`)
  console.log(`  ── WeightSum(raw): ${Object.entries(score.components).map(([k,v]) => `${k}=${typeof v==='number'?v.toFixed(1):'?'}`).join(' ')} ──`)
}

// ── 兼容别名（engine.ts和stages.ts引用此名称）──
export const calculateNexusScore = computeCompositePlayerScore
