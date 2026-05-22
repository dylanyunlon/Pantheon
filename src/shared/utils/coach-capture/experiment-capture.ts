import type { CoachAdvice, CoachAdviceType, CoachAdvicePriority } from '../coach-engine'
import type { AggregatedTeamProfile, TeamComparisonResult } from '../coach-cache/aggregator'
import type { GamePhase, ScheduledAdvice } from '../coach-scheduler'
import type { CoachChanges, DataAvailability } from '../coach-cache/query'
import { createCoachChanges } from '../coach-cache/query'
import type { PrivacyScrubber } from './privacy-scrubber'

export type CaptureEventKind =
  | 'advice-generated'
  | 'advice-delivered'
  | 'advice-expired'
  | 'advice-suppressed'
  | 'phase-transition'
  | 'team-comparison'
  | 'data-completeness'
  | 'user-feedback'
  | 'pipeline-timing'
  | 'scheduler-decision'
  | 'feature-snapshot'

export interface CaptureEvent {
  id: string
  kind: CaptureEventKind
  timestamp: number
  sessionId: string
  gamePhase: GamePhase
  payload: Record<string, unknown>
}

export interface FeatureVector {
  selfWinRate: number
  selfKda: number
  selfChampWinRate: number
  selfChampGames: number
  selfCsPerMinute: number
  selfVisionScore: number
  selfKillParticipation: number
  selfDamageShare: number
  selfLosingStreak: number
  selfWinningStreak: number
  selfRankNumeric: number
  allyAvgWinRate: number
  allyAvgKda: number
  allyAvgDamageShare: number
  allyAvgTankiness: number
  allyAvgVision: number
  allyTeamCompleteness: number
  enemyAvgWinRate: number
  enemyAvgKda: number
  enemyAvgDamageShare: number
  enemyAvgTankiness: number
  enemyAvgVision: number
  enemyTeamCompleteness: number
  overallDelta: number
  comparisonConfidence: number
  gameMode: number
  queueType: number
  phaseOrdinal: number
  premadeGroupMaxSize: number
  rankGapMax: number
  laneRankGap: number
  allyPhysDamageShare: number
  allyMagicDamageShare: number
  dataCompletenessRatio: number
}

export interface TrainingSample {
  featureVector: FeatureVector
  advisedTypes: string[]
  advisedPriorities: number[]
  advisedConfidences: number[]
  topAdviceType: string
  topAdvicePriority: number
  phaseLabel: string
  timestamp: number
  sessionId: string
  outcome: 'pending' | 'win' | 'loss' | 'unknown'
}

export interface CaptureSessionMeta {
  sessionId: string
  startedAt: number
  endedAt: number | null
  gameMode: string
  queueType: string
  selfPuuid: string
  eventCount: number
  sampleCount: number
  phases: GamePhase[]
}

const PHASE_ORDINAL: Record<GamePhase, number> = {
  'pre-game': 0,
  'champ-select': 1,
  'loading': 2,
  'early-game': 3,
  'mid-game': 4,
  'late-game': 5,
  'post-game': 6,
  'unknown': -1
}

const GAME_MODE_MAP: Record<string, number> = {
  CLASSIC: 0,
  ARAM: 1,
  URF: 2,
  CHERRY: 3,
  NEXUSBLITZ: 4,
  ONEFORALL: 5
}

function generateCaptureId(): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).substring(2, 8)
  return `cap-${ts}-${rand}`
}

function generateSessionId(): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).substring(2, 10)
  return `ses-${ts}-${rand}`
}

export class RingBuffer<T> {
  private _buffer: T[]
  private _head: number = 0
  private _count: number = 0
  private _capacity: number

  constructor(capacity: number) {
    this._capacity = capacity
    this._buffer = new Array(capacity)
  }

  push(item: T): void {
    this._buffer[this._head] = item
    this._head = (this._head + 1) % this._capacity
    if (this._count < this._capacity) this._count++
  }

  toArray(): T[] {
    if (this._count === 0) return []
    if (this._count < this._capacity) {
      return this._buffer.slice(0, this._count)
    }
    const tail = this._buffer.slice(this._head)
    const head = this._buffer.slice(0, this._head)
    return tail.concat(head)
  }

  get length(): number {
    return this._count
  }

  get capacity(): number {
    return this._capacity
  }

  clear(): void {
    this._buffer = new Array(this._capacity)
    this._head = 0
    this._count = 0
  }
}

export class DistributedAccumulator {
  private _partials: Map<string, { sum: number; count: number; min: number; max: number }> =
    new Map()
  private _mergeLog: { nodeId: string; timestamp: number }[] = []

  accumulate(nodeId: string, key: string, value: number): void {
    const existing = this._partials.get(key) || { sum: 0, count: 0, min: Infinity, max: -Infinity }
    existing.sum += value
    existing.count += 1
    existing.min = Math.min(existing.min, value)
    existing.max = Math.max(existing.max, value)
    this._partials.set(key, existing)
    this._mergeLog.push({ nodeId, timestamp: Date.now() })
  }

  merge(other: DistributedAccumulator): void {
    for (const [key, otherVal] of other._partials) {
      const existing = this._partials.get(key) || {
        sum: 0,
        count: 0,
        min: Infinity,
        max: -Infinity
      }
      existing.sum += otherVal.sum
      existing.count += otherVal.count
      existing.min = Math.min(existing.min, otherVal.min)
      existing.max = Math.max(existing.max, otherVal.max)
      this._partials.set(key, existing)
    }
    this._mergeLog.push(...other._mergeLog)
  }

  getAverage(key: string): number {
    const p = this._partials.get(key)
    if (!p || p.count === 0) return 0
    return p.sum / p.count
  }

  getStats(key: string): { avg: number; min: number; max: number; count: number } | null {
    const p = this._partials.get(key)
    if (!p || p.count === 0) return null
    return { avg: p.sum / p.count, min: p.min, max: p.max, count: p.count }
  }

  get mergeCount(): number {
    return this._mergeLog.length
  }

  get keys(): string[] {
    return Array.from(this._partials.keys())
  }

  clear(): void {
    this._partials.clear()
    this._mergeLog = []
  }
}

export class ExperimentCapture {
  private _sessionId: string
  private _events: RingBuffer<CaptureEvent>
  private _samples: RingBuffer<TrainingSample>
  private _sessionMeta: CaptureSessionMeta
  private _accumulator: DistributedAccumulator
  private _changes: CoachChanges = createCoachChanges()
  private _listeners: Array<(event: CaptureEvent) => void> = []
  private _active: boolean = false
  private _flushTimer: ReturnType<typeof setInterval> | null = null
  private _pendingFlush: CaptureEvent[] = []
  private _flushCallback: ((events: CaptureEvent[]) => void) | null = null
  private _privacyScrubber: PrivacyScrubber | null = null

  constructor(options?: { eventCapacity?: number; sampleCapacity?: number }) {
    this._events = new RingBuffer<CaptureEvent>(options?.eventCapacity || 500)
    this._samples = new RingBuffer<TrainingSample>(options?.sampleCapacity || 100)
    this._sessionId = generateSessionId()
    this._accumulator = new DistributedAccumulator()
    this._sessionMeta = {
      sessionId: this._sessionId,
      startedAt: Date.now(),
      endedAt: null,
      gameMode: '',
      queueType: '',
      selfPuuid: '',
      eventCount: 0,
      sampleCount: 0,
      phases: []
    }
  }

  get sessionId(): string {
    return this._sessionId
  }

  get privacyScrubber(): PrivacyScrubber | null {
    return this._privacyScrubber
  }

  setPrivacyScrubber(scrubber: PrivacyScrubber | null): void {
    this._privacyScrubber = scrubber
  }

  get isActive(): boolean {
    return this._active
  }

  get accumulator(): DistributedAccumulator {
    return this._accumulator
  }

  get sessionMeta(): Readonly<CaptureSessionMeta> {
    return this._sessionMeta
  }

  startSession(params: {
    gameMode: string
    queueType: string
    selfPuuid: string
  }): string {
    this._sessionId = generateSessionId()
    this._active = true
    this._sessionMeta = {
      sessionId: this._sessionId,
      startedAt: Date.now(),
      endedAt: null,
      gameMode: params.gameMode,
      queueType: params.queueType,
      selfPuuid: params.selfPuuid,
      eventCount: 0,
      sampleCount: 0,
      phases: []
    }
    this._accumulator.clear()
    return this._sessionId
  }

  endSession(): CaptureSessionMeta {
    this._active = false
    this._sessionMeta.endedAt = Date.now()
    this._flushPending()
    return { ...this._sessionMeta }
  }

  captureAdviceGenerated(
    advices: CoachAdvice[],
    gamePhase: GamePhase,
    pipelineDurationMs: number
  ): CaptureEvent {
    const event: CaptureEvent = {
      id: generateCaptureId(),
      kind: 'advice-generated',
      timestamp: Date.now(),
      sessionId: this._sessionId,
      gamePhase,
      payload: {
        adviceCount: advices.length,
        types: advices.map((a) => a.type),
        priorities: advices.map((a) => a.priority),
        confidences: advices.map((a) => a.confidence),
        audiences: advices.map((a) => a.audience),
        pipelineDurationMs
      }
    }
    this._record(event)
    this._accumulator.accumulate('local', 'pipelineDuration', pipelineDurationMs)
    this._accumulator.accumulate('local', 'adviceCount', advices.length)
    return event
  }

  captureAdviceDelivered(advice: CoachAdvice, gamePhase: GamePhase): CaptureEvent {
    const event: CaptureEvent = {
      id: generateCaptureId(),
      kind: 'advice-delivered',
      timestamp: Date.now(),
      sessionId: this._sessionId,
      gamePhase,
      payload: {
        type: advice.type,
        priority: advice.priority,
        confidence: advice.confidence,
        title: advice.title
      }
    }
    this._record(event)
    return event
  }

  capturePhaseTransition(from: GamePhase, to: GamePhase): CaptureEvent {
    const event: CaptureEvent = {
      id: generateCaptureId(),
      kind: 'phase-transition',
      timestamp: Date.now(),
      sessionId: this._sessionId,
      gamePhase: to,
      payload: { from, to }
    }
    this._record(event)
    if (!this._sessionMeta.phases.includes(to)) {
      this._sessionMeta.phases.push(to)
    }
    return event
  }

  captureTeamComparison(result: TeamComparisonResult, gamePhase: GamePhase): CaptureEvent {
    const event: CaptureEvent = {
      id: generateCaptureId(),
      kind: 'team-comparison',
      timestamp: Date.now(),
      sessionId: this._sessionId,
      gamePhase,
      payload: {
        overallDelta: result.overallDelta,
        confidence: result.confidence,
        dimensionDeltas: result.dimensionDeltas,
        allyCompleteness: result.allyProfile.completeness,
        enemyCompleteness: result.enemyProfile.completeness
      }
    }
    this._record(event)
    this._accumulator.accumulate('local', 'overallDelta', result.overallDelta)
    this._accumulator.accumulate('local', 'confidence', result.confidence)
    return event
  }

  captureUserFeedback(
    adviceType: string,
    feedback: 'helpful' | 'not-helpful' | 'dismiss',
    gamePhase: GamePhase
  ): CaptureEvent {
    const event: CaptureEvent = {
      id: generateCaptureId(),
      kind: 'user-feedback',
      timestamp: Date.now(),
      sessionId: this._sessionId,
      gamePhase,
      payload: { adviceType, feedback }
    }
    this._record(event)
    this._accumulator.accumulate(
      'local',
      `feedback:${feedback}`,
      1
    )
    return event
  }

  captureFeatureSnapshot(vector: FeatureVector, gamePhase: GamePhase): CaptureEvent {
    const event: CaptureEvent = {
      id: generateCaptureId(),
      kind: 'feature-snapshot',
      timestamp: Date.now(),
      sessionId: this._sessionId,
      gamePhase,
      payload: { featureVector: vector }
    }
    this._record(event)
    return event
  }

  buildTrainingSample(
    featureVector: FeatureVector,
    advices: CoachAdvice[],
    gamePhase: GamePhase
  ): TrainingSample {
    const topAdvice = advices.length > 0 ? advices[0] : null
    const sample: TrainingSample = {
      featureVector,
      advisedTypes: advices.map((a) => a.type),
      advisedPriorities: advices.map((a) => a.priority),
      advisedConfidences: advices.map((a) => a.confidence),
      topAdviceType: topAdvice ? topAdvice.type : 'none',
      topAdvicePriority: topAdvice ? topAdvice.priority : -1,
      phaseLabel: gamePhase,
      timestamp: Date.now(),
      sessionId: this._sessionId,
      outcome: 'pending'
    }
    this._samples.push(sample)
    this._sessionMeta.sampleCount++
    return sample
  }

  extractFeatureVector(params: {
    selfAnalysis: {
      summary: {
        winRate: number
        averageKda: number
        averageCsPerMinute: number
        averageVisionScore: number
        averageKillParticipationRate: number
        averageDamageDealtToChampionShareToTop: number
        losingStreak: number
        winningStreak: number
        count: number
      }
      champions: Record<number, { count: number; win: number }>
    } | null
    selfChampionId: number | null
    selfRankNumeric: number
    allyProfile: AggregatedTeamProfile | null
    enemyProfile: AggregatedTeamProfile | null
    teamComparison: TeamComparisonResult | null
    gameMode: string
    queueType: string
    gamePhase: GamePhase
    premadeGroupMaxSize: number
    rankGapMax: number
    laneRankGap: number
    allyPhysDamageShare: number
    allyMagicDamageShare: number
    dataCompletenessRatio: number
  }): FeatureVector {
    const self = params.selfAnalysis?.summary
    let selfChampWinRate = 0
    let selfChampGames = 0
    if (params.selfAnalysis && params.selfChampionId) {
      const champData = params.selfAnalysis.champions[params.selfChampionId]
      if (champData && champData.count > 0) {
        selfChampWinRate = champData.win / champData.count
        selfChampGames = champData.count
      }
    }

    return {
      selfWinRate: self?.winRate ?? 0,
      selfKda: self?.averageKda ?? 0,
      selfChampWinRate,
      selfChampGames,
      selfCsPerMinute: self?.averageCsPerMinute ?? 0,
      selfVisionScore: self?.averageVisionScore ?? 0,
      selfKillParticipation: self?.averageKillParticipationRate ?? 0,
      selfDamageShare: self?.averageDamageDealtToChampionShareToTop ?? 0,
      selfLosingStreak: self?.losingStreak ?? 0,
      selfWinningStreak: self?.winningStreak ?? 0,
      selfRankNumeric: params.selfRankNumeric,
      allyAvgWinRate: params.allyProfile?.avgWinRate ?? 0,
      allyAvgKda: params.allyProfile?.avgKda ?? 0,
      allyAvgDamageShare: params.allyProfile?.avgDamageShare ?? 0,
      allyAvgTankiness: params.allyProfile?.avgTankinessShare ?? 0,
      allyAvgVision: params.allyProfile?.avgVisionScore ?? 0,
      allyTeamCompleteness: params.allyProfile?.completeness ?? 0,
      enemyAvgWinRate: params.enemyProfile?.avgWinRate ?? 0,
      enemyAvgKda: params.enemyProfile?.avgKda ?? 0,
      enemyAvgDamageShare: params.enemyProfile?.avgDamageShare ?? 0,
      enemyAvgTankiness: params.enemyProfile?.avgTankinessShare ?? 0,
      enemyAvgVision: params.enemyProfile?.avgVisionScore ?? 0,
      enemyTeamCompleteness: params.enemyProfile?.completeness ?? 0,
      overallDelta: params.teamComparison?.overallDelta ?? 0,
      comparisonConfidence: params.teamComparison?.confidence ?? 0,
      gameMode: GAME_MODE_MAP[params.gameMode] ?? -1,
      queueType: params.queueType === 'RANKED_SOLO_5x5' ? 0 : params.queueType === 'RANKED_FLEX_SR' ? 1 : 2,
      phaseOrdinal: PHASE_ORDINAL[params.gamePhase] ?? -1,
      premadeGroupMaxSize: params.premadeGroupMaxSize,
      rankGapMax: params.rankGapMax,
      laneRankGap: params.laneRankGap,
      allyPhysDamageShare: params.allyPhysDamageShare,
      allyMagicDamageShare: params.allyMagicDamageShare,
      dataCompletenessRatio: params.dataCompletenessRatio
    }
  }

  setOutcome(sessionId: string, outcome: 'win' | 'loss' | 'unknown'): number {
    let updated = 0
    for (const sample of this._samples.toArray()) {
      if (sample.sessionId === sessionId && sample.outcome === 'pending') {
        sample.outcome = outcome
        updated++
      }
    }
    return updated
  }

  onEvent(listener: (event: CaptureEvent) => void): () => void {
    this._listeners.push(listener)
    return () => {
      const idx = this._listeners.indexOf(listener)
      if (idx >= 0) this._listeners.splice(idx, 1)
    }
  }

  setFlushCallback(callback: (events: CaptureEvent[]) => void): void {
    this._flushCallback = callback
  }

  startAutoFlush(intervalMs: number = 10_000): void {
    if (this._flushTimer !== null) return
    this._flushTimer = setInterval(() => this._flushPending(), intervalMs)
  }

  stopAutoFlush(): void {
    if (this._flushTimer !== null) {
      clearInterval(this._flushTimer)
      this._flushTimer = null
    }
    this._flushPending()
  }

  getEvents(): CaptureEvent[] {
    return this._events.toArray()
  }

  getSamples(): TrainingSample[] {
    return this._samples.toArray()
  }

  getExportPayload(): {
    meta: CaptureSessionMeta
    events: CaptureEvent[]
    samples: TrainingSample[]
    accumulatorStats: Record<string, { avg: number; min: number; max: number; count: number }>
  } {
    const stats: Record<string, { avg: number; min: number; max: number; count: number }> = {}
    for (const key of this._accumulator.keys) {
      const s = this._accumulator.getStats(key)
      if (s) stats[key] = s
    }
    const raw = {
      meta: { ...this._sessionMeta },
      events: this._events.toArray(),
      samples: this._samples.toArray(),
      accumulatorStats: stats
    }
    if (this._privacyScrubber) {
      return this._privacyScrubber.scrubExportPayload(raw)
    }
    return raw
  }

  clear(): void {
    this._events.clear()
    this._samples.clear()
    this._accumulator.clear()
    this._pendingFlush = []
    this._active = false
    this._sessionMeta.endedAt = Date.now()
  }

  dispose(): void {
    this.stopAutoFlush()
    this.clear()
    this._listeners = []
    this._flushCallback = null
  }

  private _record(event: CaptureEvent): void {
    this._events.push(event)
    this._sessionMeta.eventCount++
    this._pendingFlush.push(event)
    for (const listener of this._listeners) {
      try {
        listener(event)
      } catch (_) {}
    }
  }

  private _flushPending(): void {
    if (this._pendingFlush.length === 0) return
    if (this._flushCallback) {
      try {
        this._flushCallback([...this._pendingFlush])
      } catch (_) {}
    }
    this._pendingFlush = []
  }
}

export function createExperimentCapture(options?: {
  eventCapacity?: number
  sampleCapacity?: number
}): ExperimentCapture {
  return new ExperimentCapture(options)
}
