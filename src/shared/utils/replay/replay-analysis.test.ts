import { describe, it, expect, beforeEach } from 'vitest'
import { ReplayAnalysisPipeline, createReplayAnalysisPipeline } from './replay-analysis'
import type { GameclientEogStatsBlock } from '@shared/types/league-client/end-of-game'
import type { TrainingSample, FeatureVector } from '../capture/experiment-capture'

function makeEogStats(overrides?: Partial<GameclientEogStatsBlock>): GameclientEogStatsBlock {
  return {
    gameId: 12345,
    gameMode: 'CLASSIC',
    isRanked: true,
    queueId: 420,
    queueType: 'RANKED_SOLO_5x5',
    statsBlock: {
      gameLengthSeconds: 1800,
      players: [
        {
          PUUID: 'self-puuid', championId: 1, championLevel: 18, championName: 'Ahri',
          championSkinId: 1, damageDealt: 50000, damageDealtToChampions: 25000,
          damageTaken: 20000, goldEarned: 15000, itemIds: [3089, 3020],
          playerAssists: 8, playerDeaths: 3, playerKills: 10, playerId: 1,
          subteamId: 1, subteamStanding: 1, summonerSpell1: 4, summonerSpell2: 12,
          augmentPlatformIds: []
        },
        {
          PUUID: 'ally-1', championId: 2, championLevel: 16, championName: 'Garen',
          championSkinId: 2, damageDealt: 30000, damageDealtToChampions: 15000,
          damageTaken: 40000, goldEarned: 12000, itemIds: [3068],
          playerAssists: 5, playerDeaths: 5, playerKills: 4, playerId: 2,
          subteamId: 1, subteamStanding: 1, summonerSpell1: 4, summonerSpell2: 14,
          augmentPlatformIds: []
        },
        {
          PUUID: 'enemy-1', championId: 3, championLevel: 15, championName: 'Yasuo',
          championSkinId: 3, damageDealt: 35000, damageDealtToChampions: 20000,
          damageTaken: 25000, goldEarned: 11000, itemIds: [3031],
          playerAssists: 3, playerDeaths: 7, playerKills: 5, playerId: 3,
          subteamId: 2, subteamStanding: 2, summonerSpell1: 4, summonerSpell2: 12,
          augmentPlatformIds: []
        }
      ]
    },
    ...overrides
  }
}

function makePendingSample(sessionId: string): TrainingSample {
  return {
    featureVector: {} as FeatureVector,
    advisedTypes: ['macro_strategy'],
    advisedPriorities: [2],
    advisedConfidences: [0.8],
    topAdviceType: 'macro_strategy',
    topAdvicePriority: 2,
    phaseLabel: 'champ-select',
    timestamp: Date.now(),
    sessionId,
    outcome: 'pending'
  }
}

describe('ReplayAnalysisPipeline', () => {
  let pipeline: ReplayAnalysisPipeline

  beforeEach(() => {
    pipeline = createReplayAnalysisPipeline()
  })

  it('analyzeReplay detects win correctly', () => {
    const report = pipeline.analyzeReplay({
      eogStats: makeEogStats(),
      selfPuuid: 'self-puuid',
      sessionId: 'test-session',
      advicesGiven: [],
      pendingSamples: [],
      featureVector: null,
      teamComparison: null
    })
    expect(report.outcome.outcome).toBe('win')
    expect(report.outcome.selfStats).not.toBeNull()
    expect(report.outcome.selfStats!.kills).toBe(10)
    expect(report.outcome.selfStats!.kda).toBeCloseTo(6.0, 1)
    expect(report.outcome.gameDurationSeconds).toBe(1800)
  })

  it('analyzeReplay detects loss correctly', () => {
    const eog = makeEogStats()
    eog.statsBlock.players[0].subteamStanding = 2
    const report = pipeline.analyzeReplay({
      eogStats: eog,
      selfPuuid: 'self-puuid',
      sessionId: 's1',
      advicesGiven: [],
      pendingSamples: [],
      featureVector: null,
      teamComparison: null
    })
    expect(report.outcome.outcome).toBe('loss')
  })

  it('backfills pending training samples', () => {
    const samples = [
      makePendingSample('s1'),
      makePendingSample('s1'),
      makePendingSample('other-session')
    ]
    const report = pipeline.analyzeReplay({
      eogStats: makeEogStats(),
      selfPuuid: 'self-puuid',
      sessionId: 's1',
      advicesGiven: [],
      pendingSamples: samples,
      featureVector: null,
      teamComparison: null
    })
    expect(report.backfilledSamples).toBe(2)
    expect(samples[0].outcome).toBe('win')
    expect(samples[1].outcome).toBe('win')
    expect(samples[2].outcome).toBe('pending')
  })

  it('scores advice accuracy', () => {
    const advices = [
      { type: 'macro_strategy' as any, priority: 2, title: '己方整体实力占优', message: '占优', evidence: [], confidence: 0.7, audience: 'team' as const },
      { type: 'enemy_weakness' as any, priority: 1, title: '对手近期状态不佳', message: '', evidence: [], confidence: 0.8, audience: 'self' as const }
    ]
    const report = pipeline.analyzeReplay({
      eogStats: makeEogStats(),
      selfPuuid: 'self-puuid',
      sessionId: 's1',
      advicesGiven: advices,
      pendingSamples: [],
      featureVector: null,
      teamComparison: { overallDelta: 0.05 }
    })
    expect(report.adviceAccuracy.length).toBe(2)
    expect(report.overallAccuracy).toBeGreaterThan(0)

    const macroAcc = report.adviceAccuracy.find(a => a.adviceType === 'macro_strategy')
    expect(macroAcc!.wasAccurate).toBe(true)
    expect(macroAcc!.accuracyScore).toBeGreaterThan(0.5)
  })

  it('stores and retrieves reports', () => {
    pipeline.analyzeReplay({
      eogStats: makeEogStats(),
      selfPuuid: 'self-puuid',
      sessionId: 's1',
      advicesGiven: [],
      pendingSamples: [],
      featureVector: null,
      teamComparison: null
    })
    expect(pipeline.getReports().length).toBe(1)
    expect(pipeline.getReport(12345)).not.toBeNull()
    expect(pipeline.getLatestReport()).not.toBeNull()
    expect(pipeline.getReport(99999)).toBeNull()
  })

  it('getAccuracyHistory aggregates across reports', () => {
    for (let i = 0; i < 3; i++) {
      const eog = makeEogStats()
      eog.gameId = 100 + i
      pipeline.analyzeReplay({
        eogStats: eog,
        selfPuuid: 'self-puuid',
        sessionId: `s${i}`,
        advicesGiven: [
          { type: 'mental' as any, priority: 1, title: '连胜', message: '连胜', evidence: [], confidence: 0.9, audience: 'self' as const }
        ],
        pendingSamples: [],
        featureVector: null,
        teamComparison: null
      })
    }
    const history = pipeline.getAccuracyHistory()
    expect(history.totalReports).toBe(3)
    expect(history.avgAccuracy).toBeGreaterThan(0)
    expect(history.accuracyByType['mental']).toBeDefined()
    expect(history.accuracyByType['mental'].count).toBe(3)
  })

  it('computes prediction error', () => {
    pipeline.analyzeReplay({
      eogStats: makeEogStats(),
      selfPuuid: 'self-puuid',
      sessionId: 's1',
      advicesGiven: [],
      pendingSamples: [],
      featureVector: null,
      teamComparison: { overallDelta: 0.1 }
    })
    const errors = pipeline.getPredictionErrorHistory()
    expect(errors.errors.length).toBe(1)
    expect(typeof errors.avgPredictionError).toBe('number')
  })

  it('onReport listener fires', () => {
    let fired = false
    pipeline.onReport(() => { fired = true })
    pipeline.analyzeReplay({
      eogStats: makeEogStats(),
      selfPuuid: 'self-puuid',
      sessionId: 's1',
      advicesGiven: [],
      pendingSamples: [],
      featureVector: null,
      teamComparison: null
    })
    expect(fired).toBe(true)
  })

  it('backfillOutcome standalone method', () => {
    const samples = [makePendingSample('s1'), makePendingSample('s2')]
    const count = pipeline.backfillOutcome(samples, 's1', 'loss')
    expect(count).toBe(1)
    expect(samples[0].outcome).toBe('loss')
    expect(samples[1].outcome).toBe('pending')
  })

  it('clear resets reports', () => {
    pipeline.analyzeReplay({
      eogStats: makeEogStats(),
      selfPuuid: 'self-puuid',
      sessionId: 's1',
      advicesGiven: [],
      pendingSamples: [],
      featureVector: null,
      teamComparison: null
    })
    pipeline.clear()
    expect(pipeline.getReports().length).toBe(0)
  })
})
