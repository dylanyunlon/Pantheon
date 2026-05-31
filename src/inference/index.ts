/**
 * 推理引擎 — ML模型推理 + 规则引擎回退
 *
 * 来源：原项目 src/shared/utils/inference/inference-engine.ts
 * 改动（~20%）：
 *   1. 增加预测历史记录（最近50次推理结果）
 *   2. 简化FeatureVector字段（移除部分冗余字段）
 *   3. 规则引擎阈值微调
 *   4. 全程introspector探针
 */

import type { FeatureVector } from '../capture'
import type { GamePhase } from '../types'
import { introspector } from '../debug/introspector'

const MODULE = 'inference'

export interface InferenceResult {
  predictions: AdvicePrediction[]
  latencyMs: number
  modelId: string
  featureHash: string
}

export interface AdvicePrediction {
  adviceType: string
  score: number
  priority: number
  confidence: number
  reasoning: string[]
}

export type InferenceBackend = 'onnx' | 'rule-engine' | 'ensemble'

export interface InferenceConfig {
  backend: InferenceBackend
  modelPath: string | null
  minConfidenceThreshold: number
  maxPredictions: number
  fallbackToRules: boolean
  ensembleWeight: number
  timeoutMs: number
}

const DEFAULT_CONFIG: InferenceConfig = {
  backend: 'rule-engine',
  modelPath: null,
  minConfidenceThreshold: 0.28, // 改动：原0.3
  maxPredictions: 8,
  fallbackToRules: true,
  ensembleWeight: 0.6,
  timeoutMs: 500
}

const FEATURE_KEYS: (keyof FeatureVector)[] = [
  'selfWinRate', 'selfKda', 'selfChampWinRate', 'selfChampGames',
  'selfCsPerMinute', 'selfVisionScore', 'selfKillParticipation',
  'selfDamageShare', 'selfLosingStreak', 'selfWinningStreak',
  'selfRankNumeric',
  'allyAvgKda', 'allyAvgDamageShare', 'allyAvgTankiness', 'allyAvgVision',
  'enemyAvgKda', 'enemyAvgDamageShare', 'enemyAvgTankiness', 'enemyAvgVision',
  'overallDelta', 'comparisonConfidence',
  'gameMode', 'phaseOrdinal', 'dataCompletenessRatio'
]

function hashFeatureVector(fv: FeatureVector): string {
  let h = 0
  for (const k of FEATURE_KEYS) {
    const v = (fv as any)[k] as number ?? 0
    h = ((h << 5) - h + (v * 1000 | 0)) | 0
  }
  return h.toString(36)
}

function softmax(logits: number[]): number[] {
  const maxLogit = Math.max(...logits)
  const exps = logits.map(l => Math.exp(l - maxLogit))
  const sum = exps.reduce((s, e) => s + e, 0)
  return exps.map(e => e / sum)
}

function argTopK(arr: number[], k: number): number[] {
  return arr.map((v, i) => ({ v, i }))
    .sort((a, b) => b.v - a.v)
    .slice(0, k)
    .map(x => x.i)
}

export interface OnnxSession {
  run(feeds: Record<string, { data: Float32Array; dims: number[] }>): Promise<Record<string, { data: Float32Array }>>
  dispose(): void
}

export type OnnxSessionFactory = (modelPath: string) => Promise<OnnxSession>

/** 新增：推理历史条目 */
interface PredictionHistoryEntry {
  timestamp: number
  featureHash: string
  backend: InferenceBackend
  latencyMs: number
  topPrediction: string
  topScore: number
}

export class NexusInferenceEngine {
  private _config: InferenceConfig
  private _session: OnnxSession | null = null
  private _sessionFactory: OnnxSessionFactory | null = null
  private _isReady = false
  private _totalInferences = 0
  private _totalLatencyMs = 0
  private _errors = 0
  private _cache = new Map<string, { result: InferenceResult; timestamp: number }>()
  private _cacheMaxAge = 30_000
  private _cacheMaxSize = 50
  /** 新增：预测历史 */
  private _history: PredictionHistoryEntry[] = []
  private _historyMaxSize = 50

  constructor(config?: Partial<InferenceConfig>) {
    this._config = { ...DEFAULT_CONFIG, ...config }

    introspector.registerProbe(MODULE, 'inference_state', () => ({
      backend: this._config.backend,
      isReady: this._isReady,
      totalInferences: this._totalInferences,
      avgLatencyMs: this._totalInferences > 0 ? (this._totalLatencyMs / this._totalInferences).toFixed(1) : 0,
      errors: this._errors,
      cacheSize: this._cache.size,
      historySize: this._history.length
    }))
  }

  get isReady(): boolean { return this._isReady }
  get backend(): InferenceBackend { return this._config.backend }
  get stats() {
    return {
      totalInferences: this._totalInferences,
      avgLatencyMs: this._totalInferences > 0 ? this._totalLatencyMs / this._totalInferences : 0,
      errors: this._errors,
      cacheSize: this._cache.size,
      isReady: this._isReady,
      backend: this._config.backend
    }
  }

  /** 新增：获取最近的推理历史 */
  get predictionHistory(): readonly PredictionHistoryEntry[] {
    return this._history
  }

  setSessionFactory(factory: OnnxSessionFactory): void {
    this._sessionFactory = factory
  }

  async loadModel(modelPath: string): Promise<boolean> {
    if (!this._sessionFactory) {
      introspector.warn(MODULE, 'No session factory set, cannot load ONNX model')
      return false
    }
    try {
      if (this._session) { this._session.dispose(); this._session = null }
      this._session = await this._sessionFactory(modelPath)
      this._config.backend = 'onnx'
      this._isReady = true
      this._cache.clear()
      introspector.info(MODULE, 'ONNX model loaded', { modelPath })
      return true
    } catch (error: any) {
      this._errors++
      introspector.error(MODULE, `Model load failed: ${error?.message}`)
      this._isReady = false
      return false
    }
  }

  async predict(featureVector: FeatureVector, gamePhase: GamePhase): Promise<InferenceResult> {
    const start = Date.now()
    const fvHash = hashFeatureVector(featureVector)

    const cached = this._cache.get(fvHash)
    if (cached && Date.now() - cached.timestamp < this._cacheMaxAge) {
      return cached.result
    }

    let result: InferenceResult

    if (this._config.backend === 'onnx' && this._session && this._isReady) {
      try {
        result = await this._runOnnxInference(featureVector, fvHash, gamePhase)
      } catch (error) {
        this._errors++
        if (this._config.fallbackToRules) {
          result = this._runRuleBasedInference(featureVector, fvHash, gamePhase)
        } else throw error
      }
    } else {
      result = this._runRuleBasedInference(featureVector, fvHash, gamePhase)
    }

    result.latencyMs = Date.now() - start
    this._totalInferences++
    this._totalLatencyMs += result.latencyMs

    // 新增：记录历史
    this._recordHistory(fvHash, result)

    if (this._cache.size >= this._cacheMaxSize) {
      const oldest = this._cache.keys().next().value
      if (oldest) this._cache.delete(oldest)
    }
    this._cache.set(fvHash, { result, timestamp: Date.now() })

    return result
  }

  predictSync(featureVector: FeatureVector, gamePhase: GamePhase): InferenceResult {
    const start = Date.now()
    const fvHash = hashFeatureVector(featureVector)
    const cached = this._cache.get(fvHash)
    if (cached && Date.now() - cached.timestamp < this._cacheMaxAge) return cached.result

    const result = this._runRuleBasedInference(featureVector, fvHash, gamePhase)
    result.latencyMs = Date.now() - start
    this._totalInferences++
    this._totalLatencyMs += result.latencyMs
    this._recordHistory(fvHash, result)
    this._cache.set(fvHash, { result, timestamp: Date.now() })
    return result
  }

  switchBackend(backend: InferenceBackend): void {
    if (backend === 'onnx' && !this._session) {
      introspector.warn(MODULE, 'Cannot switch to ONNX without loaded model')
      return
    }
    this._config.backend = backend
    this._cache.clear()
    introspector.info(MODULE, `Backend switched to ${backend}`)
  }

  clearCache(): void { this._cache.clear() }

  dispose(): void {
    if (this._session) { this._session.dispose(); this._session = null }
    this._isReady = false
    this._cache.clear()
    this._history = []
  }

  private _runRuleBasedInference(fv: FeatureVector, fvHash: string, gamePhase: GamePhase): InferenceResult {
    const predictions: AdvicePrediction[] = []

    if (fv.selfWinRate < 0.42 && fv.selfLosingStreak >= 2) {
      predictions.push({
        adviceType: 'mental', score: 0.78 + fv.selfLosingStreak * 0.025,
        priority: 1, confidence: Math.min(0.88, 0.58 + fv.dataCompletenessRatio * 0.3),
        reasoning: ['losing_streak', 'low_winrate']
      })
    }

    if (fv.overallDelta > 0.04) {
      predictions.push({
        adviceType: 'macro_strategy', score: 0.48 + fv.overallDelta * 2.2,
        priority: 2, confidence: fv.comparisonConfidence * 0.78,
        reasoning: ['team_advantage', `delta=${fv.overallDelta.toFixed(3)}`]
      })
    } else if (fv.overallDelta < -0.04) {
      predictions.push({
        adviceType: 'macro_strategy', score: 0.48 + Math.abs(fv.overallDelta) * 2.2,
        priority: 1, confidence: fv.comparisonConfidence * 0.78,
        reasoning: ['team_disadvantage', `delta=${fv.overallDelta.toFixed(3)}`]
      })
    }

    if (fv.enemyAvgKda < 1.6) {
      predictions.push({
        adviceType: 'enemy_weakness', score: 0.68, priority: 1,
        confidence: 0.72, reasoning: ['enemy_low_kda']
      })
    }

    if (fv.selfCsPerMinute < 5.8 && fv.phaseOrdinal <= 3) {
      predictions.push({
        adviceType: 'laning_phase', score: 0.52, priority: 2,
        confidence: 0.68, reasoning: ['low_cs']
      })
    }

    if (fv.selfWinningStreak >= 3) {
      predictions.push({
        adviceType: 'mental', score: 0.38, priority: 3,
        confidence: 0.88, reasoning: ['winning_streak']
      })
    }

    predictions.sort((a, b) => b.score - a.score)

    return {
      predictions: predictions.slice(0, this._config.maxPredictions),
      latencyMs: 0,
      modelId: 'rule-engine-v2', // 改动：版本号v2
      featureHash: fvHash
    }
  }

  private async _runOnnxInference(fv: FeatureVector, fvHash: string, gamePhase: GamePhase): Promise<InferenceResult> {
    const inputTensor = new Float32Array(FEATURE_KEYS.length)
    for (let i = 0; i < FEATURE_KEYS.length; i++) {
      inputTensor[i] = (fv as any)[FEATURE_KEYS[i]] as number ?? 0
    }

    const output = await Promise.race([
      this._session!.run({ input: { data: inputTensor, dims: [1, FEATURE_KEYS.length] } }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('inference timeout')), this._config.timeoutMs)
      )
    ])

    const logits = Array.from(output.output.data)
    const probs = softmax(logits)
    const topIndices = argTopK(probs, this._config.maxPredictions)
    const predictions = topIndices
      .filter(i => probs[i] >= this._config.minConfidenceThreshold)
      .map(i => ({
        adviceType: `type_${i}`,
        score: probs[i],
        priority: probs[i] > 0.7 ? 0 : probs[i] > 0.5 ? 1 : 2,
        confidence: probs[i],
        reasoning: [`model_score=${probs[i].toFixed(3)}`, `phase=${gamePhase}`]
      }))

    return { predictions, latencyMs: 0, modelId: 'onnx-model', featureHash: fvHash }
  }

  private _recordHistory(fvHash: string, result: InferenceResult): void {
    const entry: PredictionHistoryEntry = {
      timestamp: Date.now(),
      featureHash: fvHash,
      backend: this._config.backend,
      latencyMs: result.latencyMs,
      topPrediction: result.predictions[0]?.adviceType ?? 'none',
      topScore: result.predictions[0]?.score ?? 0
    }
    this._history.push(entry)
    if (this._history.length > this._historyMaxSize) this._history.shift()
  }
}

export function createInferenceEngine(config?: Partial<InferenceConfig>): NexusInferenceEngine {
  return new NexusInferenceEngine(config)
}
