import { describe, it, expect } from 'vitest'
import {
  exportToJson,
  exportSamplesToCsv,
  exportEventsToCsv,
  computeExportStats,
  createExportBlob
} from './data-export-service'
import type { ExportPayload } from './data-export-service'
import type { TrainingSample, CaptureEvent, FeatureVector } from '../capture/experiment-capture'

function makeSample(outcome: 'win' | 'loss' | 'pending' = 'pending'): TrainingSample {
  return {
    featureVector: {
      selfWinRate: 0.55, selfKda: 3.0, selfChampWinRate: 0.6, selfChampGames: 15,
      selfCsPerMinute: 7.0, selfVisionScore: 1.2, selfKillParticipation: 0.6,
      selfDamageShare: 0.55, selfLosingStreak: 0, selfWinningStreak: 2,
      selfRankNumeric: 20,
      allyAvgWinRate: 0.52, allyAvgKda: 2.5, allyAvgDamageShare: 0.48,
      allyAvgTankiness: 0.3, allyAvgVision: 1.1, allyTeamCompleteness: 0.9,
      enemyAvgWinRate: 0.48, enemyAvgKda: 2.2, enemyAvgDamageShare: 0.5,
      enemyAvgTankiness: 0.35, enemyAvgVision: 0.9, enemyTeamCompleteness: 0.85,
      overallDelta: 0.03, comparisonConfidence: 0.7,
      gameMode: 0, queueType: 0, phaseOrdinal: 1,
      premadeGroupMaxSize: 0, rankGapMax: 4, laneRankGap: 2,
      allyPhysDamageShare: 0.55, allyMagicDamageShare: 0.35,
      dataCompletenessRatio: 0.95
    },
    advisedTypes: ['macro_strategy', 'lane_matchup'],
    advisedPriorities: [2, 1],
    advisedConfidences: [0.75, 0.82],
    topAdviceType: 'lane_matchup',
    topAdvicePriority: 1,
    phaseLabel: 'champ-select',
    timestamp: Date.now(),
    sessionId: 'test-session',
    outcome
  }
}

function makeEvent(): CaptureEvent {
  return {
    id: 'evt-1',
    kind: 'advice-generated',
    timestamp: Date.now(),
    sessionId: 'test-session',
    gamePhase: 'champ-select',
    payload: { adviceCount: 3 }
  }
}

function makePayload(): ExportPayload {
  return {
    meta: {
      exportedAt: Date.now(),
      format: 'json',
      sampleCount: 3,
      eventCount: 2,
      sessionId: 'test-session'
    },
    samples: [makeSample('win'), makeSample('loss'), makeSample('pending')],
    events: [makeEvent(), makeEvent()]
  }
}

describe('data-export-service', () => {
  it('exportToJson produces valid JSON', () => {
    const json = exportToJson(makePayload())
    const parsed = JSON.parse(json)
    expect(parsed.meta).toBeDefined()
    expect(parsed.samples.length).toBe(3)
    expect(parsed.events.length).toBe(2)
  })

  it('exportToJson with prettyPrint', () => {
    const json = exportToJson(makePayload(), { prettyPrint: true })
    expect(json).toContain('\n')
    expect(json).toContain('  ')
  })

  it('exportToJson with outcome filter', () => {
    const json = exportToJson(makePayload(), { filterOutcome: 'win' })
    const parsed = JSON.parse(json)
    expect(parsed.samples.length).toBe(1)
    expect(parsed.samples[0].outcome).toBe('win')
  })

  it('exportSamplesToCsv produces CSV with header', () => {
    const csv = exportSamplesToCsv([makeSample()])
    const lines = csv.split('\n')
    expect(lines.length).toBe(2)
    expect(lines[0]).toContain('selfWinRate')
    expect(lines[0]).toContain('topAdviceType')
    expect(lines[1]).toContain('0.55')
  })

  it('exportEventsToCsv produces CSV', () => {
    const csv = exportEventsToCsv([makeEvent()])
    const lines = csv.split('\n')
    expect(lines.length).toBe(2)
    expect(lines[0]).toBe('id,kind,timestamp,sessionId,gamePhase,payload')
    expect(lines[1]).toContain('evt-1')
  })

  it('computeExportStats counts correctly', () => {
    const stats = computeExportStats(makePayload())
    expect(stats.totalSamples).toBe(3)
    expect(stats.winSamples).toBe(1)
    expect(stats.lossSamples).toBe(1)
    expect(stats.pendingSamples).toBe(1)
    expect(stats.totalEvents).toBe(2)
    expect(stats.uniquePhases).toBe(1)
    expect(stats.uniqueAdviceTypes).toBe(2)
    expect(stats.avgConfidence).toBeGreaterThan(0)
    expect(stats.exportSizeEstimateBytes).toBeGreaterThan(0)
  })

  it('createExportBlob JSON format', () => {
    const { blob, filename, mimeType } = createExportBlob(makePayload(), { format: 'json' })
    expect(blob).toBeInstanceOf(Blob)
    expect(filename).toContain('.json')
    expect(mimeType).toBe('application/json')
  })

  it('createExportBlob CSV format', () => {
    const { blob, filename, mimeType } = createExportBlob(makePayload(), { format: 'csv' })
    expect(blob).toBeInstanceOf(Blob)
    expect(filename).toContain('.csv')
    expect(mimeType).toBe('text/csv')
  })
})
