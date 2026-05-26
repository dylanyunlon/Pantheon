import type { PantheonAdvice, PantheonAdvicePriority, PantheonAdviceType } from '../engine'
import type { FeatureVector, TrainingSample } from '../capture/experiment-capture'
import type { GamePhase } from '../scheduler'
import type { InferenceResult, AdvicePrediction } from '../inference/inference-engine'
import type { ReplayAnalysisReport } from '../replay/replay-analysis'

export interface FeedbackRecord {
  adviceType: string
  feedback: 'helpful' | 'not-helpful' | 'dismiss'
  timestamp: number
  gamePhase: GamePhase
  sessionId: string
}

export interface SourceWeight {
  sourceId: string
  weight: number
  sampleCount: number
  avgAccuracy: number
  lastUpdated: number
}

export interface FusedAdvice {
  advice: PantheonAdvice
  fusionScore: number
  sources: string[]
  calibratedConfidence: number
  adaptedPriority: number
  reasoning: string[]
}

export interface CoordinatorConfig {
  feedbackEmaAlpha: number
  minFeedbackSamples: number
  accuracyCalibrationWindow: number
  fusionTemperature: number
  sourceDecayHalfLifeMs: number
  maxFusedAdvices: number
  enableAccuracyCalibration: boolean
  enableFeedbackAdaptation: boolean
  coldStartWeight: number
  diversityPenalty: number
  typeBudget: Record<string, number>
}

const DEFAULT_CONFIG: CoordinatorConfig = {
  feedbackEmaAlpha: 0.15,
  minFeedbackSamples: 5,
  accuracyCalibrationWindow: 20,
  fusionTemperature: 1.2,
  sourceDecayHalfLifeMs: 300_000,
  maxFusedAdvices: 10,
  enableAccuracyCalibration: true,
  enableFeedbackAdaptation: true,
  coldStartWeight: 0.5,
  diversityPenalty: 0.15,
  typeBudget: {}
}

const PRIORITY_VALUE: Record<number, number> = {
  0: 1.0,
  1: 0.8,
  2: 0.6,
  3: 0.4,
  4: 0.2
}

function priorityToFloat(priority: number): number {
  return PRIORITY_VALUE[priority] ?? 0.3
}

function clamp(val: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, val))
}

function stableSoftmax(scores: number[], temperature: number): number[] {
  const t = Math.max(temperature, 0.01)
  const scaled = scores.map(s => s / t)
  const maxVal = Math.max(...scaled)
  const exps = scaled.map(s => Math.exp(s - maxVal))
  const sum = exps.reduce((a, b) => a + b, 0)
  if (sum === 0) return scores.map(() => 1.0 / scores.length)
  return exps.map(e => e / sum)
}

export class FeedbackWeightAdapter {
  private _typeWeights: Map<string, number> = new Map()
  private _typeSampleCounts: Map<string, number> = new Map()
  private _typeHelpfulRatio: Map<string, number> = new Map()
  private _feedbackLog: FeedbackRecord[] = []
  private _logCapacity: number
  private _emaAlpha: number
  private _minSamples: number

  constructor(emaAlpha: number, minSamples: number, logCapacity: number = 500) {
    this._emaAlpha = clamp(emaAlpha, 0.01, 0.5)
    this._minSamples = Math.max(1, minSamples)
    this._logCapacity = logCapacity
  }

  recordFeedback(record: FeedbackRecord): void {
    if (this._feedbackLog.length >= this._logCapacity) {
      this._feedbackLog.shift()
    }
    this._feedbackLog.push(record)

    const { adviceType, feedback } = record
    const prevCount = this._typeSampleCounts.get(adviceType) || 0
    const newCount = prevCount + 1
    this._typeSampleCounts.set(adviceType, newCount)

    const signal = feedback === 'helpful' ? 1.0 : feedback === 'not-helpful' ? -0.5 : -0.1
    const prevRatio = this._typeHelpfulRatio.get(adviceType) ?? 0.5
    const updatedRatio = prevRatio * (1 - this._emaAlpha) + signal * this._emaAlpha
    this._typeHelpfulRatio.set(adviceType, clamp(updatedRatio, -1, 1))

    const baseWeight = (updatedRatio + 1.0) / 2.0
    this._typeWeights.set(adviceType, clamp(baseWeight, 0.05, 1.0))
  }

  getWeight(adviceType: string, coldStartWeight: number): number {
    const count = this._typeSampleCounts.get(adviceType) || 0
    if (count < this._minSamples) return coldStartWeight
    return this._typeWeights.get(adviceType) ?? coldStartWeight
  }

  getHelpfulRatio(adviceType: string): number {
    return this._typeHelpfulRatio.get(adviceType) ?? 0.5
  }

  getSampleCount(adviceType: string): number {
    return this._typeSampleCounts.get(adviceType) || 0
  }

  getTypeStats(): Array<{
    adviceType: string
    weight: number
    sampleCount: number
    helpfulRatio: number
  }> {
    const result: Array<{
      adviceType: string
      weight: number
      sampleCount: number
      helpfulRatio: number
    }> = []
    for (const [adviceType, weight] of this._typeWeights) {
      result.push({
        adviceType,
        weight,
        sampleCount: this._typeSampleCounts.get(adviceType) || 0,
        helpfulRatio: this._typeHelpfulRatio.get(adviceType) ?? 0.5
      })
    }
    return result.sort((a, b) => b.weight - a.weight)
  }

  getRecentFeedback(limit: number): FeedbackRecord[] {
    return this._feedbackLog.slice(-limit)
  }

  clear(): void {
    this._typeWeights.clear()
    this._typeSampleCounts.clear()
    this._typeHelpfulRatio.clear()
    this._feedbackLog = []
  }
}

export class AccuracyCalibrator {
  private _typeAccuracy: Map<string, number[]> = new Map()
  private _window: number

  constructor(window: number) {
    this._window = Math.max(1, window)
  }

  ingestReplayReport(report: ReplayAnalysisReport): void {
    if (!report.adviceAccuracy) return
    for (const entry of report.adviceAccuracy) {
      const buf = this._typeAccuracy.get(entry.adviceType) || []
      buf.push(entry.wasAccurate ? 1.0 : 0.0)
      if (buf.length > this._window) buf.shift()
      this._typeAccuracy.set(entry.adviceType, buf)
    }
  }

  getCalibrationFactor(adviceType: string): number {
    const buf = this._typeAccuracy.get(adviceType)
    if (!buf || buf.length < 3) return 1.0
    const avg = buf.reduce((s, v) => s + v, 0) / buf.length
    return 0.5 + avg * 0.5
  }

  getTypeAccuracyStats(): Array<{ adviceType: string; accuracy: number; samples: number }> {
    const result: Array<{ adviceType: string; accuracy: number; samples: number }> = []
    for (const [adviceType, buf] of this._typeAccuracy) {
      const avg = buf.length > 0 ? buf.reduce((s, v) => s + v, 0) / buf.length : 0
      result.push({ adviceType, accuracy: avg, samples: buf.length })
    }
    return result.sort((a, b) => b.accuracy - a.accuracy)
  }

  clear(): void {
    this._typeAccuracy.clear()
  }
}

export class SourceFusionLayer {
  private _sourceWeights: Map<string, SourceWeight> = new Map()
  private _temperature: number
  private _diversityPenalty: number

  constructor(temperature: number, diversityPenalty: number) {
    this._temperature = Math.max(0.01, temperature)
    this._diversityPenalty = clamp(diversityPenalty, 0, 0.5)
  }

  registerSource(sourceId: string, initialWeight: number): void {
    this._sourceWeights.set(sourceId, {
      sourceId,
      weight: clamp(initialWeight, 0.01, 1.0),
      sampleCount: 0,
      avgAccuracy: 0.5,
      lastUpdated: Date.now()
    })
  }

  updateSourceAccuracy(sourceId: string, accuracy: number): void {
    const entry = this._sourceWeights.get(sourceId)
    if (!entry) return
    entry.sampleCount++
    entry.avgAccuracy = entry.avgAccuracy * 0.9 + accuracy * 0.1
    entry.weight = clamp(0.3 + entry.avgAccuracy * 0.7, 0.1, 1.0)
    entry.lastUpdated = Date.now()
  }

  fuseAdviceSets(
    sourceSets: Array<{ sourceId: string; advices: PantheonAdvice[] }>,
    feedbackAdapter: FeedbackWeightAdapter,
    calibrator: AccuracyCalibrator,
    config: CoordinatorConfig
  ): FusedAdvice[] {
    const advicePool: Array<{
      advice: PantheonAdvice
      sourceId: string
      rawScore: number
    }> = []

    for (const { sourceId, advices } of sourceSets) {
      const sourceEntry = this._sourceWeights.get(sourceId)
      const sourceWeight = sourceEntry?.weight ?? config.coldStartWeight

      for (const advice of advices) {
        const feedbackWeight = config.enableFeedbackAdaptation
          ? feedbackAdapter.getWeight(advice.type, config.coldStartWeight)
          : 1.0
        const calibrationFactor = config.enableAccuracyCalibration
          ? calibrator.getCalibrationFactor(advice.type)
          : 1.0
        const priorityBoost = priorityToFloat(advice.priority)
        const rawScore =
          advice.confidence
          * sourceWeight
          * feedbackWeight
          * calibrationFactor
          * (0.5 + 0.5 * priorityBoost)

        advicePool.push({ advice, sourceId, rawScore })
      }
    }

    if (advicePool.length === 0) return []

    const grouped = new Map<string, typeof advicePool>()
    for (const entry of advicePool) {
      const key = `${entry.advice.type}:${entry.advice.title}`
      const group = grouped.get(key) || []
      group.push(entry)
      grouped.set(key, group)
    }

    const fusedCandidates: FusedAdvice[] = []
    for (const [, group] of grouped) {
      const scores = group.map(e => e.rawScore)
      const maxScore = Math.max(...scores)
      const combinedScore = scores.reduce((s, v) => s + v, 0) / scores.length * (1 + 0.1 * (group.length - 1))
      const bestEntry = group.reduce((a, b) => a.rawScore > b.rawScore ? a : b)
      const sources = [...new Set(group.map(e => e.sourceId))]

      const reasoning: string[] = []
      for (const entry of group) {
        reasoning.push(`${entry.sourceId}:score=${entry.rawScore.toFixed(3)}`)
      }

      fusedCandidates.push({
        advice: bestEntry.advice,
        fusionScore: combinedScore,
        sources,
        calibratedConfidence: clamp(combinedScore, 0, 1),
        adaptedPriority: bestEntry.advice.priority,
        reasoning
      })
    }

    fusedCandidates.sort((a, b) => b.fusionScore - a.fusionScore)

    const typeCounts = new Map<string, number>()
    const diversified: FusedAdvice[] = []

    for (const candidate of fusedCandidates) {
      const typeCount = typeCounts.get(candidate.advice.type) || 0
      const budget = config.typeBudget[candidate.advice.type] ?? 3

      if (typeCount >= budget) continue

      const penalty = typeCount * this._diversityPenalty
      candidate.fusionScore *= (1 - penalty)

      typeCounts.set(candidate.advice.type, typeCount + 1)
      diversified.push(candidate)

      if (diversified.length >= config.maxFusedAdvices) break
    }

    diversified.sort((a, b) => b.fusionScore - a.fusionScore)
    return diversified
  }

  getSourceStats(): SourceWeight[] {
    return Array.from(this._sourceWeights.values())
  }

  clear(): void {
    this._sourceWeights.clear()
  }
}

export class DecisionCoordinator {
  private _config: CoordinatorConfig
  private _feedbackAdapter: FeedbackWeightAdapter
  private _calibrator: AccuracyCalibrator
  private _fusionLayer: SourceFusionLayer
  private _lastFusedResult: FusedAdvice[] = []
  private _totalCoordinations = 0
  private _totalFusionLatencyMs = 0
  private _lastCoordinationTimestamp = 0

  constructor(config?: Partial<CoordinatorConfig>) {
    this._config = { ...DEFAULT_CONFIG, ...config }
    this._feedbackAdapter = new FeedbackWeightAdapter(
      this._config.feedbackEmaAlpha,
      this._config.minFeedbackSamples
    )
    this._calibrator = new AccuracyCalibrator(
      this._config.accuracyCalibrationWindow
    )
    this._fusionLayer = new SourceFusionLayer(
      this._config.fusionTemperature,
      this._config.diversityPenalty
    )
    this._fusionLayer.registerSource('pipeline', 0.7)
    this._fusionLayer.registerSource('inference', 0.5)
    this._fusionLayer.registerSource('replay-hint', 0.3)
  }

  coordinate(
    pipelineAdvices: PantheonAdvice[],
    inferenceResult: InferenceResult | null,
    replayHints: PantheonAdvice[],
    gamePhase: GamePhase
  ): FusedAdvice[] {
    const start = Date.now()

    const sourceSets: Array<{ sourceId: string; advices: PantheonAdvice[] }> = [
      { sourceId: 'pipeline', advices: pipelineAdvices }
    ]

    if (inferenceResult && inferenceResult.predictions.length > 0) {
      const inferenceAdvices = this._predictionsToAdvices(inferenceResult.predictions, gamePhase)
      sourceSets.push({ sourceId: 'inference', advices: inferenceAdvices })
    }

    if (replayHints.length > 0) {
      sourceSets.push({ sourceId: 'replay-hint', advices: replayHints })
    }

    const fused = this._fusionLayer.fuseAdviceSets(
      sourceSets,
      this._feedbackAdapter,
      this._calibrator,
      this._config
    )

    this._lastFusedResult = fused
    this._totalCoordinations++
    this._totalFusionLatencyMs += Date.now() - start
    this._lastCoordinationTimestamp = Date.now()

    return fused
  }

  recordFeedback(
    adviceType: string,
    feedback: 'helpful' | 'not-helpful' | 'dismiss',
    gamePhase: GamePhase,
    sessionId: string
  ): void {
    this._feedbackAdapter.recordFeedback({
      adviceType,
      feedback,
      timestamp: Date.now(),
      gamePhase,
      sessionId
    })
  }

  ingestReplayReport(report: ReplayAnalysisReport): void {
    this._calibrator.ingestReplayReport(report)

    if (report.overallAccuracy !== undefined) {
      this._fusionLayer.updateSourceAccuracy('pipeline', report.overallAccuracy)
    }
  }

  updateInferenceAccuracy(accuracy: number): void {
    this._fusionLayer.updateSourceAccuracy('inference', accuracy)
  }

  getLastFusedResult(): FusedAdvice[] {
    return this._lastFusedResult
  }

  extractFusedAdvices(): PantheonAdvice[] {
    return this._lastFusedResult.map(f => ({
      ...f.advice,
      confidence: f.calibratedConfidence
    }))
  }

  get stats(): {
    totalCoordinations: number
    avgFusionLatencyMs: number
    lastCoordinationTimestamp: number
    feedbackStats: ReturnType<FeedbackWeightAdapter['getTypeStats']>
    accuracyStats: ReturnType<AccuracyCalibrator['getTypeAccuracyStats']>
    sourceStats: SourceWeight[]
    lastFusedCount: number
  } {
    return {
      totalCoordinations: this._totalCoordinations,
      avgFusionLatencyMs: this._totalCoordinations > 0
        ? this._totalFusionLatencyMs / this._totalCoordinations
        : 0,
      lastCoordinationTimestamp: this._lastCoordinationTimestamp,
      feedbackStats: this._feedbackAdapter.getTypeStats(),
      accuracyStats: this._calibrator.getTypeAccuracyStats(),
      sourceStats: this._fusionLayer.getSourceStats(),
      lastFusedCount: this._lastFusedResult.length
    }
  }

  get feedbackAdapter(): FeedbackWeightAdapter {
    return this._feedbackAdapter
  }

  get calibrator(): AccuracyCalibrator {
    return this._calibrator
  }

  get fusionLayer(): SourceFusionLayer {
    return this._fusionLayer
  }

  clear(): void {
    this._feedbackAdapter.clear()
    this._calibrator.clear()
    this._fusionLayer.clear()
    this._lastFusedResult = []
    this._totalCoordinations = 0
    this._totalFusionLatencyMs = 0
    this._lastCoordinationTimestamp = 0
    this._fusionLayer.registerSource('pipeline', 0.7)
    this._fusionLayer.registerSource('inference', 0.5)
    this._fusionLayer.registerSource('replay-hint', 0.3)
  }

  dispose(): void {
    this.clear()
  }

  private _predictionsToAdvices(
    predictions: AdvicePrediction[],
    gamePhase: GamePhase
  ): PantheonAdvice[] {
    return predictions.map(p => ({
      type: p.adviceType as PantheonAdviceType,
      priority: p.priority as PantheonAdvicePriority,
      title: this._inferenceAdviceTitle(p.adviceType, gamePhase),
      message: this._inferenceAdviceMessage(p.adviceType, p.reasoning, gamePhase),
      evidence: p.reasoning,
      confidence: p.confidence,
      audience: 'self' as const
    }))
  }

  private _inferenceAdviceTitle(adviceType: string, gamePhase: GamePhase): string {
    const titleMap: Record<string, string> = {
      mental: '心态调整建议',
      macro_strategy: '宏观策略建议',
      rank_disparity: '段位差距提醒',
      lane_matchup: '对线匹配分析',
      enemy_weakness: '对手弱点分析',
      composition: '阵容分析建议',
      laning_phase: '对线阶段建议',
      vision: '视野控制建议',
      risk_warning: '风险预警',
      team_synergy: '团队配合建议',
      itemization_hint: '出装建议',
      objective_timing: '目标时机建议',
      playstyle_adaptation: '打法调整建议',
      gold_efficiency: '经济效率建议',
      true_damage_warning: '真实伤害预警',
      win_condition: '胜利条件分析',
      kda_trend: 'KDA趋势提醒'
    }
    return titleMap[adviceType] || `${adviceType}分析`
  }

  private _inferenceAdviceMessage(
    adviceType: string,
    reasoning: string[],
    gamePhase: GamePhase
  ): string {
    const phaseLabel: Record<string, string> = {
      'pre-game': '赛前',
      'champ-select': '选人阶段',
      'loading': '加载中',
      'early-game': '前期',
      'mid-game': '中期',
      'late-game': '后期',
      'post-game': '赛后',
      'unknown': ''
    }
    const phase = phaseLabel[gamePhase] || ''
    const reasonSummary = reasoning.slice(0, 2).join(', ')
    const messageMap: Record<string, string> = {
      mental: `${phase}模型分析建议关注心态管理 (${reasonSummary})`,
      macro_strategy: `${phase}模型建议调整宏观策略 (${reasonSummary})`,
      rank_disparity: `${phase}模型检测到段位差异较大 (${reasonSummary})`,
      lane_matchup: `${phase}模型分析对线匹配数据 (${reasonSummary})`,
      enemy_weakness: `${phase}模型发现对手薄弱环节 (${reasonSummary})`,
      composition: `${phase}模型分析阵容搭配 (${reasonSummary})`,
      laning_phase: `${phase}模型建议优化对线表现 (${reasonSummary})`,
      vision: `${phase}模型建议加强视野控制 (${reasonSummary})`,
      risk_warning: `${phase}模型检测到潜在风险 (${reasonSummary})`,
      team_synergy: `${phase}模型发现团队配合机会 (${reasonSummary})`,
      itemization_hint: `${phase}模型建议调整出装路线 (${reasonSummary})`,
      objective_timing: `${phase}模型建议关注目标时机 (${reasonSummary})`,
      playstyle_adaptation: `${phase}模型建议适应性调整打法 (${reasonSummary})`,
      gold_efficiency: `${phase}模型建议优化经济利用 (${reasonSummary})`,
      true_damage_warning: `${phase}模型警告真实伤害威胁 (${reasonSummary})`,
      win_condition: `${phase}模型分析胜利条件 (${reasonSummary})`,
      kda_trend: `${phase}模型追踪KDA走势变化 (${reasonSummary})`
    }
    return messageMap[adviceType] || `${phase}模型分析结果 (${reasonSummary})`
  }
}

export function createDecisionCoordinator(
  config?: Partial<CoordinatorConfig>
): DecisionCoordinator {
  return new DecisionCoordinator(config)
}
