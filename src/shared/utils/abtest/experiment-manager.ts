import type { PantheonAdvice, PantheonAdviceType } from '../engine'
import type { GamePhase } from '../scheduler'
import type { FeatureVector, TrainingSample } from '../capture/experiment-capture'
import type { InferenceResult, AdvicePrediction, InferenceBackend } from '../inference'

export interface ExperimentVariant {
  id: string
  name: string
  backend: InferenceBackend
  trafficWeight: number
  description: string
}

export interface ExperimentDefinition {
  experimentId: string
  name: string
  description: string
  variants: ExperimentVariant[]
  startedAt: number
  endedAt: number | null
  status: 'draft' | 'running' | 'paused' | 'completed'
  minSampleSize: number
  confidenceLevel: number
}

export interface SessionAssignment {
  experimentId: string
  variantId: string
  sessionId: string
  assignedAt: number
  puuidHash: number
}

export interface VariantMetrics {
  variantId: string
  totalSessions: number
  totalAdvices: number
  totalFeedbackHelpful: number
  totalFeedbackUnhelpful: number
  totalFeedbackDismiss: number
  winCount: number
  lossCount: number
  pendingCount: number
  avgLatencyMs: number
  totalLatencyMs: number
  avgConfidence: number
  totalConfidence: number
  adviceTypeDistribution: Record<string, number>
  phaseDistribution: Record<string, number>
  pipelineErrors: number
}

export interface ExperimentSnapshot {
  experimentId: string
  variants: Record<string, VariantMetrics>
  totalSessions: number
  startedAt: number
  durationMs: number
  comparisonResult: ComparisonResult | null
}

export interface ComparisonResult {
  controlVariantId: string
  treatmentVariantId: string
  winRateDelta: number
  helpfulRateDelta: number
  avgLatencyDelta: number
  avgConfidenceDelta: number
  controlWinRate: number
  treatmentWinRate: number
  controlHelpfulRate: number
  treatmentHelpfulRate: number
  sampleSizeControl: number
  sampleSizeTreatment: number
  isSignificant: boolean
  pValue: number
  recommendation: 'control' | 'treatment' | 'inconclusive'
}

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

function normalApproxPValue(p1: number, n1: number, p2: number, n2: number): number {
  if (n1 === 0 || n2 === 0) return 1.0
  const pPooled = (p1 * n1 + p2 * n2) / (n1 + n2)
  const se = Math.sqrt(pPooled * (1 - pPooled) * (1 / n1 + 1 / n2))
  if (se === 0) return 1.0
  const z = Math.abs(p1 - p2) / se
  const p = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI)
  return Math.min(1.0, 2 * p)
}

function createEmptyMetrics(variantId: string): VariantMetrics {
  return {
    variantId,
    totalSessions: 0,
    totalAdvices: 0,
    totalFeedbackHelpful: 0,
    totalFeedbackUnhelpful: 0,
    totalFeedbackDismiss: 0,
    winCount: 0,
    lossCount: 0,
    pendingCount: 0,
    avgLatencyMs: 0,
    totalLatencyMs: 0,
    avgConfidence: 0,
    totalConfidence: 0,
    adviceTypeDistribution: {},
    phaseDistribution: {},
    pipelineErrors: 0
  }
}

export class ExperimentManager {
  private _experiments = new Map<string, ExperimentDefinition>()
  private _metrics = new Map<string, Map<string, VariantMetrics>>()
  private _assignments = new Map<string, SessionAssignment>()
  private _activeExperimentId: string | null = null

  createExperiment(params: {
    name: string
    description?: string
    controlBackend?: InferenceBackend
    treatmentBackend?: InferenceBackend
    trafficSplit?: number
    minSampleSize?: number
    confidenceLevel?: number
  }): ExperimentDefinition {
    const experimentId = `exp-${Date.now()}-${(Math.random() * 0xffff | 0).toString(16)}`
    const split = params.trafficSplit ?? 0.5

    const experiment: ExperimentDefinition = {
      experimentId,
      name: params.name,
      description: params.description || '',
      variants: [
        {
          id: 'control',
          name: 'Rule Engine (Control)',
          backend: params.controlBackend || 'rule-engine',
          trafficWeight: 1 - split,
          description: 'Existing rule-based advice pipeline'
        },
        {
          id: 'treatment',
          name: 'Model Inference (Treatment)',
          backend: params.treatmentBackend || 'onnx',
          trafficWeight: split,
          description: 'ONNX model-based advice inference'
        }
      ],
      startedAt: Date.now(),
      endedAt: null,
      status: 'draft',
      minSampleSize: params.minSampleSize || 30,
      confidenceLevel: params.confidenceLevel || 0.95
    }

    this._experiments.set(experimentId, experiment)
    const metricsMap = new Map<string, VariantMetrics>()
    for (const v of experiment.variants) {
      metricsMap.set(v.id, createEmptyMetrics(v.id))
    }
    this._metrics.set(experimentId, metricsMap)

    return experiment
  }

  startExperiment(experimentId: string): boolean {
    const exp = this._experiments.get(experimentId)
    if (!exp || exp.status === 'running') return false
    exp.status = 'running'
    exp.startedAt = Date.now()
    this._activeExperimentId = experimentId
    return true
  }

  pauseExperiment(experimentId: string): boolean {
    const exp = this._experiments.get(experimentId)
    if (!exp || exp.status !== 'running') return false
    exp.status = 'paused'
    return true
  }

  completeExperiment(experimentId: string): ExperimentSnapshot | null {
    const exp = this._experiments.get(experimentId)
    if (!exp) return null
    exp.status = 'completed'
    exp.endedAt = Date.now()
    if (this._activeExperimentId === experimentId) {
      this._activeExperimentId = null
    }
    return this.getSnapshot(experimentId)
  }

  assignSession(puuid: string, sessionId: string): SessionAssignment | null {
    if (!this._activeExperimentId) return null
    const exp = this._experiments.get(this._activeExperimentId)
    if (!exp || exp.status !== 'running') return null

    const existing = this._assignments.get(sessionId)
    if (existing) return existing

    const h = hashString(puuid + this._activeExperimentId)
    const bucket = (h % 1000) / 1000

    let cumWeight = 0
    let selectedVariant = exp.variants[0]
    for (const v of exp.variants) {
      cumWeight += v.trafficWeight
      if (bucket < cumWeight) {
        selectedVariant = v
        break
      }
    }

    const assignment: SessionAssignment = {
      experimentId: this._activeExperimentId,
      variantId: selectedVariant.id,
      sessionId,
      assignedAt: Date.now(),
      puuidHash: h
    }

    this._assignments.set(sessionId, assignment)

    const metricsMap = this._metrics.get(this._activeExperimentId)
    if (metricsMap) {
      const m = metricsMap.get(selectedVariant.id)
      if (m) m.totalSessions++
    }

    return assignment
  }

  getAssignment(sessionId: string): SessionAssignment | null {
    return this._assignments.get(sessionId) || null
  }

  getBackendForSession(sessionId: string): InferenceBackend | null {
    const assignment = this._assignments.get(sessionId)
    if (!assignment) return null
    const exp = this._experiments.get(assignment.experimentId)
    if (!exp) return null
    const variant = exp.variants.find(v => v.id === assignment.variantId)
    return variant?.backend || null
  }

  recordAdviceGeneration(
    sessionId: string,
    advices: PantheonAdvice[],
    latencyMs: number,
    gamePhase: GamePhase
  ): void {
    const assignment = this._assignments.get(sessionId)
    if (!assignment) return
    const metricsMap = this._metrics.get(assignment.experimentId)
    if (!metricsMap) return
    const m = metricsMap.get(assignment.variantId)
    if (!m) return

    m.totalAdvices += advices.length
    m.totalLatencyMs += latencyMs
    m.avgLatencyMs = m.totalSessions > 0 ? m.totalLatencyMs / m.totalSessions : 0

    for (const a of advices) {
      m.adviceTypeDistribution[a.type] = (m.adviceTypeDistribution[a.type] || 0) + 1
      m.totalConfidence += a.confidence
    }
    m.avgConfidence = m.totalAdvices > 0 ? m.totalConfidence / m.totalAdvices : 0
    m.phaseDistribution[gamePhase] = (m.phaseDistribution[gamePhase] || 0) + 1
  }

  recordFeedback(
    sessionId: string,
    feedback: 'helpful' | 'not-helpful' | 'dismiss'
  ): void {
    const assignment = this._assignments.get(sessionId)
    if (!assignment) return
    const metricsMap = this._metrics.get(assignment.experimentId)
    if (!metricsMap) return
    const m = metricsMap.get(assignment.variantId)
    if (!m) return

    if (feedback === 'helpful') m.totalFeedbackHelpful++
    else if (feedback === 'not-helpful') m.totalFeedbackUnhelpful++
    else m.totalFeedbackDismiss++
  }

  recordOutcome(sessionId: string, outcome: 'win' | 'loss' | 'unknown'): void {
    const assignment = this._assignments.get(sessionId)
    if (!assignment) return
    const metricsMap = this._metrics.get(assignment.experimentId)
    if (!metricsMap) return
    const m = metricsMap.get(assignment.variantId)
    if (!m) return

    if (outcome === 'win') m.winCount++
    else if (outcome === 'loss') m.lossCount++
    else m.pendingCount++
  }

  recordPipelineError(sessionId: string): void {
    const assignment = this._assignments.get(sessionId)
    if (!assignment) return
    const metricsMap = this._metrics.get(assignment.experimentId)
    if (!metricsMap) return
    const m = metricsMap.get(assignment.variantId)
    if (m) m.pipelineErrors++
  }

  computeComparison(experimentId: string): ComparisonResult | null {
    const exp = this._experiments.get(experimentId)
    if (!exp || exp.variants.length < 2) return null
    const metricsMap = this._metrics.get(experimentId)
    if (!metricsMap) return null

    const controlId = exp.variants[0].id
    const treatmentId = exp.variants[1].id
    const c = metricsMap.get(controlId)
    const t = metricsMap.get(treatmentId)
    if (!c || !t) return null

    const cGames = c.winCount + c.lossCount
    const tGames = t.winCount + t.lossCount
    const cWinRate = cGames > 0 ? c.winCount / cGames : 0
    const tWinRate = tGames > 0 ? t.winCount / tGames : 0

    const cFeedbackTotal = c.totalFeedbackHelpful + c.totalFeedbackUnhelpful
    const tFeedbackTotal = t.totalFeedbackHelpful + t.totalFeedbackUnhelpful
    const cHelpfulRate = cFeedbackTotal > 0 ? c.totalFeedbackHelpful / cFeedbackTotal : 0
    const tHelpfulRate = tFeedbackTotal > 0 ? t.totalFeedbackHelpful / tFeedbackTotal : 0

    const pValueWin = normalApproxPValue(cWinRate, cGames, tWinRate, tGames)
    const pValueHelp = normalApproxPValue(cHelpfulRate, cFeedbackTotal, tHelpfulRate, tFeedbackTotal)
    const pValue = Math.min(pValueWin, pValueHelp)

    const significanceThreshold = 1 - exp.confidenceLevel
    const isSignificant = pValue < significanceThreshold
      && cGames >= exp.minSampleSize
      && tGames >= exp.minSampleSize

    let recommendation: 'control' | 'treatment' | 'inconclusive' = 'inconclusive'
    if (isSignificant) {
      const winDelta = tWinRate - cWinRate
      const helpDelta = tHelpfulRate - cHelpfulRate
      if (winDelta > 0.02 || helpDelta > 0.05) recommendation = 'treatment'
      else if (winDelta < -0.02 || helpDelta < -0.05) recommendation = 'control'
    }

    return {
      controlVariantId: controlId,
      treatmentVariantId: treatmentId,
      winRateDelta: tWinRate - cWinRate,
      helpfulRateDelta: tHelpfulRate - cHelpfulRate,
      avgLatencyDelta: t.avgLatencyMs - c.avgLatencyMs,
      avgConfidenceDelta: t.avgConfidence - c.avgConfidence,
      controlWinRate: cWinRate,
      treatmentWinRate: tWinRate,
      controlHelpfulRate: cHelpfulRate,
      treatmentHelpfulRate: tHelpfulRate,
      sampleSizeControl: cGames,
      sampleSizeTreatment: tGames,
      isSignificant,
      pValue,
      recommendation
    }
  }

  getSnapshot(experimentId: string): ExperimentSnapshot | null {
    const exp = this._experiments.get(experimentId)
    if (!exp) return null
    const metricsMap = this._metrics.get(experimentId)
    if (!metricsMap) return null

    const variants: Record<string, VariantMetrics> = {}
    let totalSessions = 0
    for (const [vid, m] of metricsMap) {
      variants[vid] = { ...m }
      totalSessions += m.totalSessions
    }

    return {
      experimentId,
      variants,
      totalSessions,
      startedAt: exp.startedAt,
      durationMs: (exp.endedAt || Date.now()) - exp.startedAt,
      comparisonResult: this.computeComparison(experimentId)
    }
  }

  get activeExperimentId(): string | null {
    return this._activeExperimentId
  }

  getExperiment(experimentId: string): ExperimentDefinition | null {
    return this._experiments.get(experimentId) || null
  }

  listExperiments(): ExperimentDefinition[] {
    return Array.from(this._experiments.values())
  }

  getVariantMetrics(experimentId: string, variantId: string): VariantMetrics | null {
    return this._metrics.get(experimentId)?.get(variantId) || null
  }

  dispose(): void {
    this._experiments.clear()
    this._metrics.clear()
    this._assignments.clear()
    this._activeExperimentId = null
  }
}

export function createExperimentManager(): ExperimentManager {
  return new ExperimentManager()
}
