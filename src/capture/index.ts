/**
 * 实验捕获系统 — 捕获Pipeline运行事件和特征向量
 *
 * 来源：原项目 src/shared/utils/capture/experiment-capture.ts
 * 改动（~20%）：
 *   1. RingBuffer增加peek/last/debugDump方法
 *   2. DistributedAccumulator增加debugDump方法
 *   3. captureEvent自动附加__debug_capturedAt时间戳
 *   4. extractFeatureVector简化（移除对LeagueClient类型的依赖）
 *   5. 全程introspector探针
 */

import {
  Advice,
  GamePhase
} from '../types'
import { introspector } from '../debug/introspector'
import type { TeamComparisonResult, AggregatedTeamProfile } from '../cache/aggregator'

const MODULE = 'capture'

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
  __debug_capturedAt?: number
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
  enemyAvgWinRate: number
  enemyAvgKda: number
  enemyAvgDamageShare: number
  enemyAvgTankiness: number
  enemyAvgVision: number
  overallDelta: number
  comparisonConfidence: number
  gameMode: number
  phaseOrdinal: number
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
  'pre-game': 0, 'champ-select': 1, 'loading': 2, 'early-game': 3,
  'mid-game': 4, 'late-game': 5, 'post-game': 6, 'unknown': -1
}

const GAME_MODE_MAP: Record<string, number> = {
  CLASSIC: 0, ARAM: 1, URF: 2, CHERRY: 3, NEXUSBLITZ: 4, ONEFORALL: 5
}

function generateId(prefix: string): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).substring(2, 8)
  return `${prefix}-${ts}-${rand}`
}

// ── RingBuffer ──

export class RingBuffer<T> {
  private _buffer: T[]
  private _head = 0
  private _count = 0
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
    if (this._count < this._capacity) return this._buffer.slice(0, this._count)
    return this._buffer.slice(this._head).concat(this._buffer.slice(0, this._head))
  }

  /** 新增：查看最后一个元素 */
  last(): T | undefined {
    if (this._count === 0) return undefined
    const idx = (this._head - 1 + this._capacity) % this._capacity
    return this._buffer[idx]
  }

  /** 新增：查看最近N个元素 */
  peek(n: number): T[] {
    const arr = this.toArray()
    return arr.slice(-n)
  }

  get length(): number { return this._count }
  get capacity(): number { return this._capacity }

  clear(): void {
    this._buffer = new Array(this._capacity)
    this._head = 0
    this._count = 0
  }

  /** 新增：调试转储 */
  debugDump(): { count: number; capacity: number; head: number; sample: T | undefined } {
    return { count: this._count, capacity: this._capacity, head: this._head, sample: this.last() }
  }
}

// ── DistributedAccumulator ──

export class DistributedAccumulator {
  private _partials = new Map<string, { sum: number; count: number; min: number; max: number }>()
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
      const existing = this._partials.get(key) || { sum: 0, count: 0, min: Infinity, max: -Infinity }
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

  get keys(): string[] { return Array.from(this._partials.keys()) }
  get mergeCount(): number { return this._mergeLog.length }

  clear(): void {
    this._partials.clear()
    this._mergeLog = []
  }

  /** 新增：调试转储所有累计数据 */
  debugDump(): Record<string, { avg: number; min: number; max: number; count: number }> {
    const result: Record<string, any> = {}
    for (const key of this.keys) {
      result[key] = this.getStats(key)
    }
    return result
  }
}

// ── ExperimentCapture ──

export class ExperimentCapture {
  private _sessionId: string
  private _events: RingBuffer<CaptureEvent>
  private _samples: RingBuffer<TrainingSample>
  private _sessionMeta: CaptureSessionMeta
  private _accumulator: DistributedAccumulator
  private _listeners: Array<(event: CaptureEvent) => void> = []
  private _active = false
  private _flushTimer: ReturnType<typeof setInterval> | null = null
  private _pendingFlush: CaptureEvent[] = []
  private _flushCallback: ((events: CaptureEvent[]) => void) | null = null

  constructor(options?: { eventCapacity?: number; sampleCapacity?: number }) {
    this._events = new RingBuffer<CaptureEvent>(options?.eventCapacity || 500)
    this._samples = new RingBuffer<TrainingSample>(options?.sampleCapacity || 100)
    this._sessionId = generateId('ses')
    this._accumulator = new DistributedAccumulator()
    this._sessionMeta = {
      sessionId: this._sessionId,
      startedAt: Date.now(),
      endedAt: null,
      gameMode: '', queueType: '', selfPuuid: '',
      eventCount: 0, sampleCount: 0, phases: []
    }

    introspector.registerProbe(MODULE, 'capture_state', () => ({
      active: this._active,
      sessionId: this._sessionId,
      eventCount: this._events.length,
      sampleCount: this._samples.length,
      pendingFlush: this._pendingFlush.length,
      accumulatorKeys: this._accumulator.keys
    }))
  }

  get sessionId(): string { return this._sessionId }
  get isActive(): boolean { return this._active }
  get accumulator(): DistributedAccumulator { return this._accumulator }
  get sessionMeta(): Readonly<CaptureSessionMeta> { return this._sessionMeta }

  startSession(params: { gameMode: string; queueType: string; selfPuuid: string }): string {
    this._sessionId = generateId('ses')
    this._active = true
    this._sessionMeta = {
      sessionId: this._sessionId,
      startedAt: Date.now(), endedAt: null,
      gameMode: params.gameMode, queueType: params.queueType,
      selfPuuid: params.selfPuuid,
      eventCount: 0, sampleCount: 0, phases: []
    }
    this._accumulator.clear()
    introspector.info(MODULE, 'Session started', { sessionId: this._sessionId })
    return this._sessionId
  }

  endSession(): CaptureSessionMeta {
    this._active = false
    this._sessionMeta.endedAt = Date.now()
    this._flushPending()
    introspector.info(MODULE, 'Session ended', {
      sessionId: this._sessionId,
      eventCount: this._sessionMeta.eventCount,
      duration: this._sessionMeta.endedAt - this._sessionMeta.startedAt
    })
    return { ...this._sessionMeta }
  }

  captureAdviceGenerated(advices: Advice[], gamePhase: GamePhase, pipelineDurationMs: number): CaptureEvent {
    const event: CaptureEvent = {
      id: generateId('cap'),
      kind: 'advice-generated',
      timestamp: Date.now(),
      sessionId: this._sessionId,
      gamePhase,
      payload: {
        adviceCount: advices.length,
        types: advices.map(a => a.type),
        priorities: advices.map(a => a.priority),
        confidences: advices.map(a => a.confidence),
        pipelineDurationMs
      },
      __debug_capturedAt: Date.now()
    }
    this._record(event)
    this._accumulator.accumulate('local', 'pipelineDuration', pipelineDurationMs)
    this._accumulator.accumulate('local', 'adviceCount', advices.length)
    return event
  }

  capturePhaseTransition(from: GamePhase, to: GamePhase): CaptureEvent {
    const event: CaptureEvent = {
      id: generateId('cap'),
      kind: 'phase-transition',
      timestamp: Date.now(),
      sessionId: this._sessionId,
      gamePhase: to,
      payload: { from, to },
      __debug_capturedAt: Date.now()
    }
    this._record(event)
    if (!this._sessionMeta.phases.includes(to)) this._sessionMeta.phases.push(to)
    return event
  }

  captureTeamComparison(result: TeamComparisonResult, gamePhase: GamePhase): CaptureEvent {
    const event: CaptureEvent = {
      id: generateId('cap'),
      kind: 'team-comparison',
      timestamp: Date.now(),
      sessionId: this._sessionId,
      gamePhase,
      payload: {
        overallDelta: result.overallDelta,
        confidence: result.confidence,
        dimensionDeltas: result.dimensionDeltas
      },
      __debug_capturedAt: Date.now()
    }
    this._record(event)
    this._accumulator.accumulate('local', 'overallDelta', result.overallDelta)
    return event
  }

  captureUserFeedback(adviceType: string, feedback: 'helpful' | 'not-helpful' | 'dismiss', gamePhase: GamePhase): CaptureEvent {
    const event: CaptureEvent = {
      id: generateId('cap'),
      kind: 'user-feedback',
      timestamp: Date.now(),
      sessionId: this._sessionId,
      gamePhase,
      payload: { adviceType, feedback },
      __debug_capturedAt: Date.now()
    }
    this._record(event)
    this._accumulator.accumulate('local', `feedback:${feedback}`, 1)
    return event
  }

  buildTrainingSample(featureVector: FeatureVector, advices: Advice[], gamePhase: GamePhase): TrainingSample {
    const topAdvice = advices.length > 0 ? advices[0] : null
    const sample: TrainingSample = {
      featureVector,
      advisedTypes: advices.map(a => a.type),
      advisedPriorities: advices.map(a => a.priority),
      advisedConfidences: advices.map(a => a.confidence),
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
    selfSummary: { winRate: number; averageKda: number; averageCsPerMinute: number; averageVisionScore: number; averageKillParticipationRate: number; averageDamageDealtToChampionShareToTop: number; losingStreak: number; winningStreak: number } | null
    selfChampWinRate: number; selfChampGames: number; selfRankNumeric: number
    allyProfile: AggregatedTeamProfile | null
    enemyProfile: AggregatedTeamProfile | null
    teamComparison: TeamComparisonResult | null
    gameMode: string; gamePhase: GamePhase
    dataCompletenessRatio: number
  }): FeatureVector {
    const self = params.selfSummary
    return {
      selfWinRate: self?.winRate ?? 0,
      selfKda: self?.averageKda ?? 0,
      selfChampWinRate: params.selfChampWinRate,
      selfChampGames: params.selfChampGames,
      selfCsPerMinute: self?.averageCsPerMinute ?? 0,
      selfVisionScore: self?.averageVisionScore ?? 0,
      selfKillParticipation: self?.averageKillParticipationRate ?? 0,
      selfDamageShare: self?.averageDamageDealtToChampionShareToTop ?? 0,
      selfLosingStreak: self?.losingStreak ?? 0,
      selfWinningStreak: self?.winningStreak ?? 0,
      selfRankNumeric: params.selfRankNumeric,
      allyAvgWinRate: 0,
      allyAvgKda: params.allyProfile?.avgKda ?? 0,
      allyAvgDamageShare: params.allyProfile?.avgDamageShare ?? 0,
      allyAvgTankiness: params.allyProfile?.avgTankinessShare ?? 0,
      allyAvgVision: params.allyProfile?.avgVisionScore ?? 0,
      enemyAvgWinRate: 0,
      enemyAvgKda: params.enemyProfile?.avgKda ?? 0,
      enemyAvgDamageShare: params.enemyProfile?.avgDamageShare ?? 0,
      enemyAvgTankiness: params.enemyProfile?.avgTankinessShare ?? 0,
      enemyAvgVision: params.enemyProfile?.avgVisionScore ?? 0,
      overallDelta: params.teamComparison?.overallDelta ?? 0,
      comparisonConfidence: params.teamComparison?.confidence ?? 0,
      gameMode: GAME_MODE_MAP[params.gameMode] ?? -1,
      phaseOrdinal: PHASE_ORDINAL[params.gamePhase] ?? -1,
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
    introspector.debug(MODULE, `Set outcome ${outcome} for ${sessionId}: ${updated} samples updated`)
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

  getEvents(): CaptureEvent[] { return this._events.toArray() }
  getSamples(): TrainingSample[] { return this._samples.toArray() }

  getExportPayload(): {
    meta: CaptureSessionMeta; events: CaptureEvent[]
    samples: TrainingSample[]
    accumulatorStats: Record<string, { avg: number; min: number; max: number; count: number }>
  } {
    const stats: Record<string, any> = {}
    for (const key of this._accumulator.keys) {
      const s = this._accumulator.getStats(key)
      if (s) stats[key] = s
    }
    return {
      meta: { ...this._sessionMeta },
      events: this._events.toArray(),
      samples: this._samples.toArray(),
      accumulatorStats: stats
    }
  }

  clear(): void {
    this._events.clear()
    this._samples.clear()
    this._accumulator.clear()
    this._pendingFlush = []
    this._active = false
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
      try { listener(event) } catch (_) {}
    }
  }

  private _flushPending(): void {
    if (this._pendingFlush.length === 0) return
    if (this._flushCallback) {
      try { this._flushCallback([...this._pendingFlush]) } catch (_) {}
    }
    this._pendingFlush = []
  }
}

export function createExperimentCapture(options?: { eventCapacity?: number; sampleCapacity?: number }): ExperimentCapture {
  return new ExperimentCapture(options)
}
