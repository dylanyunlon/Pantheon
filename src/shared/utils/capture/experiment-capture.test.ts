import { describe, it, expect, beforeEach } from 'vitest'
import {
  RingBuffer,
  DistributedAccumulator,
  ExperimentCapture,
  createExperimentCapture
} from './experiment-capture'
import type { CaptureEvent, FeatureVector, TrainingSample } from './experiment-capture'

describe('RingBuffer', () => {
  let ring: RingBuffer<number>

  beforeEach(() => {
    ring = new RingBuffer<number>(5)
  })

  it('starts empty', () => {
    expect(ring.length).toBe(0)
    expect(ring.capacity).toBe(5)
    expect(ring.toArray()).toEqual([])
  })

  it('push items and retrieve in order', () => {
    ring.push(10)
    ring.push(20)
    ring.push(30)
    expect(ring.length).toBe(3)
    expect(ring.toArray()).toEqual([10, 20, 30])
  })

  it('fills to capacity', () => {
    for (let i = 1; i <= 5; i++) ring.push(i)
    expect(ring.length).toBe(5)
    expect(ring.toArray()).toEqual([1, 2, 3, 4, 5])
  })

  it('overwrites oldest when exceeding capacity', () => {
    for (let i = 1; i <= 7; i++) ring.push(i)
    expect(ring.length).toBe(5)
    expect(ring.toArray()).toEqual([3, 4, 5, 6, 7])
  })

  it('overwrites correctly after many cycles', () => {
    for (let i = 1; i <= 23; i++) ring.push(i)
    expect(ring.length).toBe(5)
    expect(ring.toArray()).toEqual([19, 20, 21, 22, 23])
  })

  it('clear resets state', () => {
    ring.push(1)
    ring.push(2)
    ring.clear()
    expect(ring.length).toBe(0)
    expect(ring.toArray()).toEqual([])
    ring.push(99)
    expect(ring.toArray()).toEqual([99])
  })

  it('handles capacity of 1', () => {
    const tiny = new RingBuffer<string>(1)
    tiny.push('a')
    expect(tiny.toArray()).toEqual(['a'])
    tiny.push('b')
    expect(tiny.toArray()).toEqual(['b'])
    expect(tiny.length).toBe(1)
  })

  it('preserves insertion order with objects', () => {
    const objRing = new RingBuffer<{ id: number }>(3)
    objRing.push({ id: 1 })
    objRing.push({ id: 2 })
    objRing.push({ id: 3 })
    objRing.push({ id: 4 })
    const arr = objRing.toArray()
    expect(arr.map(o => o.id)).toEqual([2, 3, 4])
  })

  it('boundary: exactly at capacity wrap', () => {
    for (let i = 1; i <= 5; i++) ring.push(i)
    expect(ring.toArray()).toEqual([1, 2, 3, 4, 5])
    ring.push(6)
    expect(ring.toArray()).toEqual([2, 3, 4, 5, 6])
  })
})

describe('DistributedAccumulator', () => {
  let acc: DistributedAccumulator

  beforeEach(() => {
    acc = new DistributedAccumulator()
  })

  it('starts empty', () => {
    expect(acc.mergeCount).toBe(0)
    expect(acc.keys).toEqual([])
    expect(acc.getAverage('x')).toBe(0)
    expect(acc.getStats('x')).toBeNull()
  })

  it('accumulates single key', () => {
    acc.accumulate('node1', 'latency', 100)
    acc.accumulate('node1', 'latency', 200)
    acc.accumulate('node1', 'latency', 300)
    expect(acc.getAverage('latency')).toBe(200)
    const stats = acc.getStats('latency')
    expect(stats).not.toBeNull()
    expect(stats!.avg).toBe(200)
    expect(stats!.min).toBe(100)
    expect(stats!.max).toBe(300)
    expect(stats!.count).toBe(3)
  })

  it('accumulates multiple keys', () => {
    acc.accumulate('n1', 'a', 10)
    acc.accumulate('n1', 'b', 20)
    acc.accumulate('n1', 'a', 30)
    expect(acc.getAverage('a')).toBe(20)
    expect(acc.getAverage('b')).toBe(20)
    expect(acc.keys.sort()).toEqual(['a', 'b'])
  })

  it('tracks merge log from multiple nodes', () => {
    acc.accumulate('node-a', 'metric', 1)
    acc.accumulate('node-b', 'metric', 2)
    acc.accumulate('node-c', 'metric', 3)
    expect(acc.mergeCount).toBe(3)
  })

  it('merges two accumulators', () => {
    acc.accumulate('n1', 'score', 10)
    acc.accumulate('n1', 'score', 20)

    const other = new DistributedAccumulator()
    other.accumulate('n2', 'score', 30)
    other.accumulate('n2', 'score', 40)
    other.accumulate('n2', 'unique', 100)

    acc.merge(other)

    expect(acc.getAverage('score')).toBe(25)
    expect(acc.getStats('score')!.count).toBe(4)
    expect(acc.getStats('score')!.min).toBe(10)
    expect(acc.getStats('score')!.max).toBe(40)
    expect(acc.getAverage('unique')).toBe(100)
  })

  it('merge preserves merge log from both', () => {
    acc.accumulate('n1', 'x', 1)
    const other = new DistributedAccumulator()
    other.accumulate('n2', 'y', 2)
    other.accumulate('n3', 'y', 3)

    acc.merge(other)
    expect(acc.mergeCount).toBe(3)
  })

  it('clear resets all state', () => {
    acc.accumulate('n1', 'k', 42)
    acc.clear()
    expect(acc.keys).toEqual([])
    expect(acc.mergeCount).toBe(0)
    expect(acc.getAverage('k')).toBe(0)
  })

  it('min/max with single value', () => {
    acc.accumulate('n1', 'val', 77)
    const stats = acc.getStats('val')!
    expect(stats.min).toBe(77)
    expect(stats.max).toBe(77)
    expect(stats.avg).toBe(77)
  })

  it('handles negative values', () => {
    acc.accumulate('n1', 'delta', -5)
    acc.accumulate('n1', 'delta', 10)
    acc.accumulate('n1', 'delta', -3)
    expect(acc.getStats('delta')!.min).toBe(-5)
    expect(acc.getStats('delta')!.max).toBe(10)
    expect(acc.getAverage('delta')).toBeCloseTo(0.6667, 3)
  })
})

describe('ExperimentCapture', () => {
  let capture: ExperimentCapture

  beforeEach(() => {
    capture = createExperimentCapture({ eventCapacity: 10, sampleCapacity: 5 })
  })

  it('creates with valid initial state', () => {
    expect(capture.sessionId).toBeTruthy()
    expect(capture.isActive).toBe(false)
    expect(capture.sessionMeta.eventCount).toBe(0)
    expect(capture.sessionMeta.sampleCount).toBe(0)
  })

  it('starts and ends session', () => {
    const sid = capture.startSession({
      gameMode: 'CLASSIC',
      queueType: 'RANKED_SOLO_5x5',
      selfPuuid: 'puuid-test-123'
    })
    expect(sid).toBeTruthy()
    expect(capture.isActive).toBe(true)
    expect(capture.sessionMeta.gameMode).toBe('CLASSIC')
    expect(capture.sessionMeta.selfPuuid).toBe('puuid-test-123')

    const meta = capture.endSession()
    expect(capture.isActive).toBe(false)
    expect(meta.endedAt).not.toBeNull()
    expect(meta.sessionId).toBe(sid)
  })

  it('captureAdviceGenerated creates event', () => {
    capture.startSession({ gameMode: 'CLASSIC', queueType: '', selfPuuid: '' })
    const mockAdvices = [
      { type: 'macro_strategy' as any, priority: 2, title: 'test', message: '', evidence: [], confidence: 0.8, audience: 'team' as const }
    ]
    const event = capture.captureAdviceGenerated(mockAdvices, 'champ-select', 42)
    expect(event.kind).toBe('advice-generated')
    expect(event.sessionId).toBe(capture.sessionId)
    expect((event.payload as any).adviceCount).toBe(1)
    expect((event.payload as any).pipelineDurationMs).toBe(42)
    expect(capture.sessionMeta.eventCount).toBe(1)
  })

  it('captureUserFeedback creates event', () => {
    capture.startSession({ gameMode: 'CLASSIC', queueType: '', selfPuuid: '' })
    const event = capture.captureUserFeedback('macro_strategy', 'helpful', 'champ-select')
    expect(event.kind).toBe('user-feedback')
    expect((event.payload as any).adviceType).toBe('macro_strategy')
    expect((event.payload as any).feedback).toBe('helpful')
  })

  it('events respect ring buffer capacity', () => {
    capture.startSession({ gameMode: 'CLASSIC', queueType: '', selfPuuid: '' })
    for (let i = 0; i < 15; i++) {
      capture.captureAdviceGenerated([], 'champ-select', i)
    }
    const events = capture.getEvents()
    expect(events.length).toBe(10)
    expect((events[0].payload as any).pipelineDurationMs).toBe(5)
  })

  it('setOutcome backfills pending samples', () => {
    const sid = capture.startSession({ gameMode: 'CLASSIC', queueType: '', selfPuuid: '' })

    const mockFv: FeatureVector = {
      selfWinRate: 0.5, selfKda: 2.0, selfChampWinRate: 0.5, selfChampGames: 5,
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

    capture.buildTrainingSample(mockFv, [
      { type: 'macro_strategy' as any, priority: 2, title: 't', message: '', evidence: [], confidence: 0.8, audience: 'team' as const }
    ], 'champ-select')

    expect(capture.getSamples().length).toBe(1)
    expect(capture.getSamples()[0].outcome).toBe('pending')

    const count = capture.setOutcome(sid, 'win')
    expect(count).toBe(1)
    expect(capture.getSamples()[0].outcome).toBe('win')
  })

  it('getExportPayload returns complete data', () => {
    capture.startSession({ gameMode: 'ARAM', queueType: 'ARAM', selfPuuid: 'p1' })
    capture.captureAdviceGenerated([], 'champ-select', 10)
    capture.captureUserFeedback('mental', 'not-helpful', 'champ-select')
    capture.accumulator.accumulate('local', 'test', 42)

    const payload = capture.getExportPayload()
    expect(payload.meta.gameMode).toBe('ARAM')
    expect(payload.events.length).toBe(2)
    expect(payload.accumulatorStats.test).toBeDefined()
    expect(payload.accumulatorStats.test.avg).toBe(42)
  })

  it('extractFeatureVector produces 35 dimensions', () => {
    const fv = capture.extractFeatureVector({
      selfAnalysis: null,
      selfChampionId: null,
      selfRankNumeric: -1,
      allyProfile: null,
      enemyProfile: null,
      teamComparison: null,
      gameMode: 'CLASSIC',
      queueType: 'RANKED_SOLO_5x5',
      gamePhase: 'champ-select',
      premadeGroupMaxSize: 0,
      rankGapMax: 0,
      laneRankGap: 0,
      allyPhysDamageShare: 0.5,
      allyMagicDamageShare: 0.3,
      dataCompletenessRatio: 0.7
    })

    const keys = Object.keys(fv)
    expect(keys.length).toBeGreaterThanOrEqual(34)
    expect(fv.allyPhysDamageShare).toBe(0.5)
    expect(fv.dataCompletenessRatio).toBe(0.7)
  })

  it('clear resets everything', () => {
    capture.startSession({ gameMode: '', queueType: '', selfPuuid: '' })
    capture.captureAdviceGenerated([], 'champ-select', 1)
    capture.clear()
    expect(capture.getEvents().length).toBe(0)
    expect(capture.getSamples().length).toBe(0)
  })
})
