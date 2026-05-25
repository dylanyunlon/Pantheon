import type { FeatureVector } from '../capture/experiment-capture'
import type { PantheonAdviceType, PantheonAdvicePriority } from '../engine'
import type { GamePhase } from '../scheduler'

export interface ModelMetadata {
  modelId: string
  version: string
  featureDim: number
  outputDim: number
  adviceTypes: string[]
  trainedAt: number
  trainingSamples: number
  accuracy: number
  createdBy: string
}

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
  batchSize: number
  warmupOnLoad: boolean
  timeoutMs: number
}

const DEFAULT_CONFIG: InferenceConfig = {
  backend: 'rule-engine',
  modelPath: null,
  minConfidenceThreshold: 0.3,
  maxPredictions: 8,
  fallbackToRules: true,
  ensembleWeight: 0.6,
  batchSize: 1,
  warmupOnLoad: true,
  timeoutMs: 500
}

const ADVICE_TYPE_INDEX: Record<string, number> = {
  laning_phase: 0, itemization: 1, teamfight: 2, objective: 3,
  vision: 4, enemy_weakness: 5, team_synergy: 6, risk_warning: 7,
  macro_strategy: 8, mental: 9, lane_matchup: 10, rank_disparity: 11,
  composition: 12, itemization_hint: 13, objective_timing: 14,
  playstyle_adaptation: 15, gold_efficiency: 16, true_damage_warning: 17,
  win_condition: 18, kda_trend: 19
}

const INDEX_TO_ADVICE_TYPE = Object.fromEntries(
  Object.entries(ADVICE_TYPE_INDEX).map(([k, v]) => [v, k])
)

const FEATURE_KEYS: (keyof FeatureVector)[] = [
  'selfWinRate', 'selfKda', 'selfChampWinRate', 'selfChampGames',
  'selfCsPerMinute', 'selfVisionScore', 'selfKillParticipation',
  'selfDamageShare', 'selfLosingStreak', 'selfWinningStreak',
  'selfRankNumeric',
  'allyAvgWinRate', 'allyAvgKda', 'allyAvgDamageShare',
  'allyAvgTankiness', 'allyAvgVision', 'allyTeamCompleteness',
  'enemyAvgWinRate', 'enemyAvgKda', 'enemyAvgDamageShare',
  'enemyAvgTankiness', 'enemyAvgVision', 'enemyTeamCompleteness',
  'overallDelta', 'comparisonConfidence',
  'gameMode', 'queueType', 'phaseOrdinal',
  'premadeGroupMaxSize', 'rankGapMax', 'laneRankGap',
  'allyPhysDamageShare', 'allyMagicDamageShare',
  'dataCompletenessRatio'
]

function featureVectorToFloat32(fv: FeatureVector): Float32Array {
  const arr = new Float32Array(FEATURE_KEYS.length)
  for (let i = 0; i < FEATURE_KEYS.length; i++) {
    arr[i] = fv[FEATURE_KEYS[i]] as number
  }
  return arr
}

function hashFeatureVector(fv: FeatureVector): string {
  let h = 0
  for (const k of FEATURE_KEYS) {
    const v = fv[k] as number
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
  return arr
    .map((v, i) => ({ v, i }))
    .sort((a, b) => b.v - a.v)
    .slice(0, k)
    .map(x => x.i)
}

export interface OnnxSession {
  run(feeds: Record<string, { data: Float32Array; dims: number[] }>): Promise<Record<string, { data: Float32Array }>>
  dispose(): void
}

export type OnnxSessionFactory = (modelPath: string) => Promise<OnnxSession>

export class PantheonInferenceEngine {
  private _config: InferenceConfig
  private _session: OnnxSession | null = null
  private _metadata: ModelMetadata | null = null
  private _sessionFactory: OnnxSessionFactory | null = null
  private _isLoading = false
  private _isReady = false
  private _totalInferences = 0
  private _totalLatencyMs = 0
  private _errors = 0
  private _cache = new Map<string, { result: InferenceResult; timestamp: number }>()
  private _cacheMaxAge = 30_000
  private _cacheMaxSize = 50

  constructor(config?: Partial<InferenceConfig>) {
    this._config = { ...DEFAULT_CONFIG, ...config }
  }

  setSessionFactory(factory: OnnxSessionFactory): void {
    this._sessionFactory = factory
  }

  get isReady(): boolean {
    return this._isReady
  }

  get isLoading(): boolean {
    return this._isLoading
  }

  get metadata(): ModelMetadata | null {
    return this._metadata
  }

  get backend(): InferenceBackend {
    return this._config.backend
  }

  get stats(): {
    totalInferences: number
    avgLatencyMs: number
    errors: number
    cacheSize: number
    isReady: boolean
    backend: InferenceBackend
  } {
    return {
      totalInferences: this._totalInferences,
      avgLatencyMs: this._totalInferences > 0 ? this._totalLatencyMs / this._totalInferences : 0,
      errors: this._errors,
      cacheSize: this._cache.size,
      isReady: this._isReady,
      backend: this._config.backend
    }
  }

  async loadModel(modelPath: string, metadata?: Partial<ModelMetadata>): Promise<boolean> {
    if (!this._sessionFactory) {
      console.warn('PantheonInferenceEngine: no session factory set, cannot load ONNX model')
      return false
    }
    if (this._isLoading) return false

    this._isLoading = true
    try {
      if (this._session) {
        this._session.dispose()
        this._session = null
      }

      this._session = await this._sessionFactory(modelPath)

      this._metadata = {
        modelId: metadata?.modelId || `coach-model-${Date.now()}`,
        version: metadata?.version || '0.1.0',
        featureDim: FEATURE_KEYS.length,
        outputDim: Object.keys(ADVICE_TYPE_INDEX).length,
        adviceTypes: Object.keys(ADVICE_TYPE_INDEX),
        trainedAt: metadata?.trainedAt || Date.now(),
        trainingSamples: metadata?.trainingSamples || 0,
        accuracy: metadata?.accuracy || 0,
        createdBy: metadata?.createdBy || 'dylanyunlon'
      }

      this._config.backend = 'onnx'
      this._isReady = true
      this._cache.clear()

      if (this._config.warmupOnLoad) {
        await this._warmup()
      }

      return true
    } catch (error) {
      console.error('PantheonInferenceEngine: failed to load model', error)
      this._errors++
      this._isReady = false
      return false
    } finally {
      this._isLoading = false
    }
  }

  async predict(
    featureVector: FeatureVector,
    gamePhase: GamePhase
  ): Promise<InferenceResult> {
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
        } else {
          throw error
        }
      }
    } else {
      result = this._runRuleBasedInference(featureVector, fvHash, gamePhase)
    }

    result.latencyMs = Date.now() - start
    this._totalInferences++
    this._totalLatencyMs += result.latencyMs

    if (this._cache.size >= this._cacheMaxSize) {
      const oldest = this._cache.keys().next().value
      if (oldest) this._cache.delete(oldest)
    }
    this._cache.set(fvHash, { result, timestamp: Date.now() })

    return result
  }

  private async _runOnnxInference(
    fv: FeatureVector,
    fvHash: string,
    gamePhase: GamePhase
  ): Promise<InferenceResult> {
    const inputTensor = featureVectorToFloat32(fv)

    const output = await Promise.race([
      this._session!.run({
        input: { data: inputTensor, dims: [1, FEATURE_KEYS.length] }
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('inference timeout')), this._config.timeoutMs)
      )
    ])

    const logits = Array.from(output.output.data)
    const probs = softmax(logits)
    const topIndices = argTopK(probs, this._config.maxPredictions)

    const predictions: AdvicePrediction[] = topIndices
      .filter(i => probs[i] >= this._config.minConfidenceThreshold)
      .map(i => ({
        adviceType: INDEX_TO_ADVICE_TYPE[i] || `unknown_${i}`,
        score: probs[i],
        priority: probs[i] > 0.7 ? 0 : probs[i] > 0.5 ? 1 : probs[i] > 0.3 ? 2 : 3,
        confidence: probs[i],
        reasoning: [`model_score=${probs[i].toFixed(3)}`, `phase=${gamePhase}`]
      }))

    return {
      predictions,
      latencyMs: 0,
      modelId: this._metadata?.modelId || 'unknown',
      featureHash: fvHash
    }
  }

  private _runRuleBasedInference(
    fv: FeatureVector,
    fvHash: string,
    gamePhase: GamePhase
  ): InferenceResult {
    const predictions: AdvicePrediction[] = []

    if (fv.selfWinRate < 0.4 && fv.selfLosingStreak >= 3) {
      predictions.push({
        adviceType: 'mental',
        score: 0.8 + fv.selfLosingStreak * 0.02,
        priority: 1,
        confidence: Math.min(0.9, 0.6 + fv.dataCompletenessRatio * 0.3),
        reasoning: ['losing_streak', 'low_winrate']
      })
    }

    if (fv.overallDelta > 0.05) {
      predictions.push({
        adviceType: 'macro_strategy',
        score: 0.5 + fv.overallDelta * 2,
        priority: 2,
        confidence: fv.comparisonConfidence * 0.8,
        reasoning: ['team_advantage', `delta=${fv.overallDelta.toFixed(3)}`]
      })
    } else if (fv.overallDelta < -0.05) {
      predictions.push({
        adviceType: 'macro_strategy',
        score: 0.5 + Math.abs(fv.overallDelta) * 2,
        priority: 1,
        confidence: fv.comparisonConfidence * 0.8,
        reasoning: ['team_disadvantage', `delta=${fv.overallDelta.toFixed(3)}`]
      })
    }

    if (fv.rankGapMax >= 8) {
      predictions.push({
        adviceType: 'rank_disparity',
        score: 0.7 + fv.rankGapMax * 0.01,
        priority: 1,
        confidence: 0.85,
        reasoning: ['high_rank_gap', `gap=${fv.rankGapMax}`]
      })
    }

    if (fv.laneRankGap >= 6) {
      predictions.push({
        adviceType: 'lane_matchup',
        score: 0.65 + fv.laneRankGap * 0.02,
        priority: 1,
        confidence: 0.8,
        reasoning: ['lane_rank_disadvantage']
      })
    }

    if (fv.enemyAvgWinRate < 0.4 && fv.enemyAvgKda < 1.5) {
      predictions.push({
        adviceType: 'enemy_weakness',
        score: 0.7,
        priority: 1,
        confidence: fv.enemyTeamCompleteness * 0.8,
        reasoning: ['enemy_low_stats']
      })
    }

    if (fv.allyPhysDamageShare > 0.75 || fv.allyMagicDamageShare > 0.75) {
      predictions.push({
        adviceType: 'composition',
        score: 0.6,
        priority: 2,
        confidence: 0.65,
        reasoning: ['damage_imbalance']
      })
    }

    if (fv.selfCsPerMinute < 5.5 && fv.phaseOrdinal <= 3) {
      predictions.push({
        adviceType: 'laning_phase',
        score: 0.55,
        priority: 2,
        confidence: 0.7,
        reasoning: ['low_cs']
      })
    }

    if (fv.selfVisionScore < 0.7) {
      predictions.push({
        adviceType: 'vision',
        score: 0.5,
        priority: 2,
        confidence: 0.6,
        reasoning: ['low_vision']
      })
    }

    if (fv.premadeGroupMaxSize >= 3) {
      predictions.push({
        adviceType: 'risk_warning',
        score: 0.65,
        priority: 1,
        confidence: 0.75,
        reasoning: ['enemy_premade']
      })
    }

    if (fv.selfWinningStreak >= 3) {
      predictions.push({
        adviceType: 'mental',
        score: 0.4,
        priority: 3,
        confidence: 0.9,
        reasoning: ['winning_streak']
      })
    }

    predictions.sort((a, b) => b.score - a.score)
    const topK = predictions.slice(0, this._config.maxPredictions)

    return {
      predictions: topK,
      latencyMs: 0,
      modelId: 'rule-engine-v1',
      featureHash: fvHash
    }
  }

  async predictBatch(
    vectors: Array<{ featureVector: FeatureVector; gamePhase: GamePhase }>
  ): Promise<InferenceResult[]> {
    const results: InferenceResult[] = []
    for (let i = 0; i < vectors.length; i += this._config.batchSize) {
      const batch = vectors.slice(i, i + this._config.batchSize)
      const batchResults = await Promise.all(
        batch.map(v => this.predict(v.featureVector, v.gamePhase))
      )
      results.push(...batchResults)
    }
    return results
  }

  switchBackend(backend: InferenceBackend): void {
    if (backend === 'onnx' && !this._session) {
      console.warn('PantheonInferenceEngine: cannot switch to onnx without loaded model')
      return
    }
    this._config.backend = backend
    this._cache.clear()
  }

  setEnsembleWeight(weight: number): void {
    this._config.ensembleWeight = Math.max(0, Math.min(1, weight))
  }

  async ensemblePredict(
    featureVector: FeatureVector,
    gamePhase: GamePhase,
    ruleResults: AdvicePrediction[]
  ): Promise<InferenceResult> {
    const modelResult = await this.predict(featureVector, gamePhase)
    const w = this._config.ensembleWeight

    const merged = new Map<string, AdvicePrediction>()

    for (const p of modelResult.predictions) {
      merged.set(p.adviceType, {
        ...p,
        score: p.score * w,
        confidence: p.confidence * w,
        reasoning: [...p.reasoning, `model_weight=${w}`]
      })
    }

    for (const p of ruleResults) {
      const existing = merged.get(p.adviceType)
      if (existing) {
        existing.score += p.score * (1 - w)
        existing.confidence = Math.max(existing.confidence, p.confidence * (1 - w))
        existing.reasoning.push(...p.reasoning, `rule_weight=${1 - w}`)
        existing.priority = Math.min(existing.priority, p.priority)
      } else {
        merged.set(p.adviceType, {
          ...p,
          score: p.score * (1 - w),
          confidence: p.confidence * (1 - w),
          reasoning: [...p.reasoning, `rule_only_weight=${1 - w}`]
        })
      }
    }

    const predictions = Array.from(merged.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, this._config.maxPredictions)

    return {
      predictions,
      latencyMs: modelResult.latencyMs,
      modelId: `ensemble:${modelResult.modelId}+rules`,
      featureHash: modelResult.featureHash
    }
  }

  clearCache(): void {
    this._cache.clear()
  }

  private async _warmup(): Promise<void> {
    const dummyFv: FeatureVector = {
      selfWinRate: 0.5, selfKda: 2.5, selfChampWinRate: 0.5, selfChampGames: 10,
      selfCsPerMinute: 6.0, selfVisionScore: 1.0, selfKillParticipation: 0.5,
      selfDamageShare: 0.5, selfLosingStreak: 0, selfWinningStreak: 0,
      selfRankNumeric: 16,
      allyAvgWinRate: 0.5, allyAvgKda: 2.0, allyAvgDamageShare: 0.5,
      allyAvgTankiness: 0.3, allyAvgVision: 1.0, allyTeamCompleteness: 1.0,
      enemyAvgWinRate: 0.5, enemyAvgKda: 2.0, enemyAvgDamageShare: 0.5,
      enemyAvgTankiness: 0.3, enemyAvgVision: 1.0, enemyTeamCompleteness: 1.0,
      overallDelta: 0, comparisonConfidence: 0.5,
      gameMode: 0, queueType: 0, phaseOrdinal: 1,
      premadeGroupMaxSize: 0, rankGapMax: 0, laneRankGap: 0,
      allyPhysDamageShare: 0.5, allyMagicDamageShare: 0.3,
      dataCompletenessRatio: 1.0
    }
    try {
      await this.predict(dummyFv, 'champ-select')
      this._cache.clear()
    } catch (_) {}
  }

  dispose(): void {
    if (this._session) {
      this._session.dispose()
      this._session = null
    }
    this._isReady = false
    this._cache.clear()
    this._metadata = null
  }
}

export function createInferenceEngine(config?: Partial<InferenceConfig>): PantheonInferenceEngine {
  return new PantheonInferenceEngine(config)
}
