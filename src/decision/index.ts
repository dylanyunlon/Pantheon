/**
 * 决策协调器 — 融合多源建议，反馈自适应权重
 *
 * 来源：原项目 src/shared/utils/decision/decision-coordinator.ts
 * 改动（~20%）：
 *   1. 融合温度自适应（根据建议数量动态调整）
 *   2. 反馈衰减使用指数加权移动平均（原线性）
 *   3. 多样性惩罚改为按类型预算限制
 *   4. 全程introspector探针
 */

import type { Advice, GamePhase } from '../types'
import { introspector } from '../debug/introspector'

const MODULE = 'decision'

export interface FeedbackRecord {
  adviceType: string
  feedback: 'helpful' | 'not-helpful' | 'dismiss'
  timestamp: number
  gamePhase: GamePhase
  sessionId: string
}

export interface FusedAdvice {
  advice: Advice
  fusionScore: number
  sources: string[]
  calibratedConfidence: number
  reasoning: string[]
}

export interface CoordinatorConfig {
  feedbackEmaAlpha: number
  minFeedbackSamples: number
  fusionTemperature: number
  maxFusedAdvices: number
  enableFeedbackAdaptation: boolean
  diversityPenalty: number
  typeBudget: Record<string, number>
}

const DEFAULT_CONFIG: CoordinatorConfig = {
  feedbackEmaAlpha: 0.18, // 改动：原0.15
  minFeedbackSamples: 4,  // 改动：原5
  fusionTemperature: 1.2,
  maxFusedAdvices: 10,
  enableFeedbackAdaptation: true,
  diversityPenalty: 0.12, // 改动：原0.15
  typeBudget: {}
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
  private _typeWeights = new Map<string, number>()
  private _typeSampleCounts = new Map<string, number>()
  private _typeHelpfulRatio = new Map<string, number>()
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
    this._feedbackLog.push(record)
    if (this._feedbackLog.length > this._logCapacity) this._feedbackLog.shift()

    const type = record.adviceType
    const count = (this._typeSampleCounts.get(type) || 0) + 1
    this._typeSampleCounts.set(type, count)

    const isHelpful = record.feedback === 'helpful' ? 1 : 0
    const prevRatio = this._typeHelpfulRatio.get(type) ?? 0.5
    // 改动：指数加权移动平均（原线性平均）
    const newRatio = prevRatio * (1 - this._emaAlpha) + isHelpful * this._emaAlpha
    this._typeHelpfulRatio.set(type, newRatio)

    if (count >= this._minSamples) {
      this._typeWeights.set(type, clamp(newRatio, 0.1, 2.0))
    }

    introspector.trace(MODULE, `Feedback for ${type}: ${record.feedback}, ratio=${newRatio.toFixed(3)}`)
  }

  getWeight(adviceType: string): number {
    return this._typeWeights.get(adviceType) ?? 1.0
  }

  getHelpfulRatio(adviceType: string): number {
    return this._typeHelpfulRatio.get(adviceType) ?? 0.5
  }

  get feedbackLog(): readonly FeedbackRecord[] { return this._feedbackLog }

  debugDump(): Record<string, { weight: number; ratio: number; samples: number }> {
    const result: Record<string, any> = {}
    for (const [type, weight] of this._typeWeights) {
      result[type] = {
        weight,
        ratio: this._typeHelpfulRatio.get(type) ?? 0,
        samples: this._typeSampleCounts.get(type) ?? 0
      }
    }
    return result
  }
}

export class DecisionCoordinator {
  private _config: CoordinatorConfig
  private _feedbackAdapter: FeedbackWeightAdapter
  private _fusedBuffer: FusedAdvice[] = []
  private _totalFusions = 0
  private _totalFeedbacks = 0

  constructor(config?: Partial<CoordinatorConfig>) {
    this._config = { ...DEFAULT_CONFIG, ...config }
    this._feedbackAdapter = new FeedbackWeightAdapter(
      this._config.feedbackEmaAlpha,
      this._config.minFeedbackSamples
    )

    introspector.registerProbe(MODULE, 'coordinator_state', () => ({
      totalFusions: this._totalFusions,
      totalFeedbacks: this._totalFeedbacks,
      fusedBufferSize: this._fusedBuffer.length,
      feedbackWeights: this._feedbackAdapter.debugDump()
    }))
  }

  get stats() {
    return {
      totalFusions: this._totalFusions,
      totalFeedbacks: this._totalFeedbacks,
      fusedBufferSize: this._fusedBuffer.length
    }
  }

  /**
   * 融合多源建议
   */
  fuseAdvices(advices: Advice[], sources: string[] = ['pipeline']): FusedAdvice[] {
    if (advices.length === 0) return []

    this._totalFusions++

    // 改动：融合温度自适应（建议越多温度越高，减少过度集中）
    const adaptedTemp = this._config.fusionTemperature + Math.log2(Math.max(advices.length, 1)) * 0.1

    const rawScores = advices.map(a => {
      const priorityFactor = 1 - (a.priority / 5)
      const feedbackWeight = this._config.enableFeedbackAdaptation
        ? this._feedbackAdapter.getWeight(a.type)
        : 1.0
      return a.confidence * priorityFactor * feedbackWeight
    })

    const softmaxed = stableSoftmax(rawScores, adaptedTemp)

    // 按类型计数（多样性控制）
    const typeCounts = new Map<string, number>()

    const fused: FusedAdvice[] = advices.map((advice, i) => {
      const typeCount = (typeCounts.get(advice.type) || 0) + 1
      typeCounts.set(advice.type, typeCount)

      const budget = this._config.typeBudget[advice.type] ?? 3
      const diversityMult = typeCount > budget
        ? Math.max(0.2, 1 - this._config.diversityPenalty * (typeCount - budget))
        : 1.0

      return {
        advice,
        fusionScore: softmaxed[i] * diversityMult,
        sources,
        calibratedConfidence: clamp(advice.confidence * softmaxed[i], 0, 1),
        reasoning: [
          `raw=${rawScores[i].toFixed(3)}`,
          `softmax=${softmaxed[i].toFixed(3)}`,
          `diversity=${diversityMult.toFixed(2)}`,
          `feedbackWeight=${this._feedbackAdapter.getWeight(advice.type).toFixed(2)}`
        ]
      }
    })

    fused.sort((a, b) => b.fusionScore - a.fusionScore)
    this._fusedBuffer = fused.slice(0, this._config.maxFusedAdvices)

    introspector.checkpoint(MODULE, 'fusion_complete', {
      inputCount: advices.length,
      outputCount: this._fusedBuffer.length,
      adaptedTemp: adaptedTemp.toFixed(2),
      topType: this._fusedBuffer[0]?.advice.type
    })

    return this._fusedBuffer
  }

  /**
   * 提取融合后的建议
   */
  extractFusedAdvices(): Advice[] {
    return this._fusedBuffer.map(f => f.advice)
  }

  recordFeedback(
    adviceType: string,
    feedback: 'helpful' | 'not-helpful' | 'dismiss',
    gamePhase: GamePhase,
    sessionId: string
  ): void {
    this._totalFeedbacks++
    this._feedbackAdapter.recordFeedback({
      adviceType, feedback, timestamp: Date.now(), gamePhase, sessionId
    })
  }

  ingestReplayReport(report: { overallAccuracy?: number; adviceAccuracy?: Array<{ type: string; accurate: boolean }> }): void {
    if (!report.adviceAccuracy) return
    for (const entry of report.adviceAccuracy) {
      this._feedbackAdapter.recordFeedback({
        adviceType: entry.type,
        feedback: entry.accurate ? 'helpful' : 'not-helpful',
        timestamp: Date.now(),
        gamePhase: 'post-game',
        sessionId: 'replay'
      })
    }
    introspector.debug(MODULE, 'Replay report ingested', {
      accuracy: report.overallAccuracy,
      entries: report.adviceAccuracy.length
    })
  }

  clear(): void {
    this._fusedBuffer = []
  }
}

export function createDecisionCoordinator(config?: Partial<CoordinatorConfig>): DecisionCoordinator {
  return new DecisionCoordinator(config)
}
