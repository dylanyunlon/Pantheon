import { describe, it, expect, beforeEach } from 'vitest'
import { PantheonInferenceEngine, createInferenceEngine } from './inference-engine'
import type { FeatureVector } from '../capture/experiment-capture'

function makeFv(overrides?: Partial<FeatureVector>): FeatureVector {
  return {
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
    dataCompletenessRatio: 1.0,
    ...overrides
  }
}

describe('PantheonInferenceEngine', () => {
  let engine: PantheonInferenceEngine

  beforeEach(() => {
    engine = createInferenceEngine()
  })

  it('defaults to rule-engine backend', () => {
    expect(engine.backend).toBe('rule-engine')
    expect(engine.isReady).toBe(false)
  })

  it('rule-engine produces predictions for losing player', async () => {
    const fv = makeFv({ selfWinRate: 0.3, selfLosingStreak: 4 })
    const result = await engine.predict(fv, 'champ-select')
    expect(result.predictions.length).toBeGreaterThan(0)
    expect(result.modelId).toBe('rule-engine-v1')
    const mental = result.predictions.find(p => p.adviceType === 'mental')
    expect(mental).toBeDefined()
    expect(mental!.reasoning).toContain('losing_streak')
  })

  it('rule-engine detects team advantage', async () => {
    const fv = makeFv({ overallDelta: 0.1 })
    const result = await engine.predict(fv, 'champ-select')
    const macro = result.predictions.find(p => p.adviceType === 'macro_strategy')
    expect(macro).toBeDefined()
    expect(macro!.reasoning).toContain('team_advantage')
  })

  it('rule-engine detects rank disparity', async () => {
    const fv = makeFv({ rankGapMax: 10 })
    const result = await engine.predict(fv, 'champ-select')
    const rank = result.predictions.find(p => p.adviceType === 'rank_disparity')
    expect(rank).toBeDefined()
  })

  it('rule-engine detects enemy weakness', async () => {
    const fv = makeFv({ enemyAvgWinRate: 0.35, enemyAvgKda: 1.2 })
    const result = await engine.predict(fv, 'champ-select')
    const weakness = result.predictions.find(p => p.adviceType === 'enemy_weakness')
    expect(weakness).toBeDefined()
  })

  it('rule-engine detects composition imbalance', async () => {
    const fv = makeFv({ allyPhysDamageShare: 0.8 })
    const result = await engine.predict(fv, 'champ-select')
    const comp = result.predictions.find(p => p.adviceType === 'composition')
    expect(comp).toBeDefined()
  })

  it('caches identical feature vectors', async () => {
    const fv = makeFv()
    const r1 = await engine.predict(fv, 'champ-select')
    const r2 = await engine.predict(fv, 'champ-select')
    expect(r1.featureHash).toBe(r2.featureHash)
    expect(engine.stats.totalInferences).toBe(1)
  })

  it('batch prediction works', async () => {
    const vectors = [
      { featureVector: makeFv({ selfLosingStreak: 5 }), gamePhase: 'champ-select' as const },
      { featureVector: makeFv({ overallDelta: -0.1 }), gamePhase: 'early-game' as const }
    ]
    const results = await engine.predictBatch(vectors)
    expect(results.length).toBe(2)
  })

  it('stats track correctly', async () => {
    await engine.predict(makeFv({ selfLosingStreak: 3 }), 'champ-select')
    await engine.predict(makeFv({ rankGapMax: 12 }), 'mid-game')
    const stats = engine.stats
    expect(stats.totalInferences).toBe(2)
    expect(stats.errors).toBe(0)
    expect(stats.backend).toBe('rule-engine')
  })

  it('clearCache empties prediction cache', async () => {
    await engine.predict(makeFv(), 'champ-select')
    expect(engine.stats.cacheSize).toBe(1)
    engine.clearCache()
    expect(engine.stats.cacheSize).toBe(0)
  })

  it('ensemble merges model + rule predictions', async () => {
    const fv = makeFv({ selfLosingStreak: 4, overallDelta: 0.08 })
    const ruleResults = [
      { adviceType: 'mental', score: 0.9, priority: 1, confidence: 0.8, reasoning: ['rule'] },
      { adviceType: 'vision', score: 0.6, priority: 2, confidence: 0.6, reasoning: ['rule'] }
    ]
    const result = await engine.ensemblePredict(fv, 'champ-select', ruleResults)
    expect(result.modelId).toContain('ensemble')
    expect(result.predictions.length).toBeGreaterThan(0)
    const mental = result.predictions.find(p => p.adviceType === 'mental')
    expect(mental).toBeDefined()
  })
})
