import { describe, it, expect, beforeEach } from 'vitest'
import {
  PrivacyScrubber,
  createPrivacyScrubber,
  validateNoLeakedPii
} from './privacy-scrubber'
import type { CaptureEvent, TrainingSample, CaptureSessionMeta } from './experiment-capture'
import type { GamePhase } from '../scheduler'

describe('PrivacyScrubber', () => {
  let scrubber: PrivacyScrubber

  beforeEach(() => {
    scrubber = createPrivacyScrubber()
  })

  describe('scrubValue', () => {
    it('should produce deterministic hashes for same input', () => {
      const a = scrubber.scrubValue('abc-123-puuid', 'puuid')
      const b = scrubber.scrubValue('abc-123-puuid', 'puuid')
      expect(a).toBe(b)
    })

    it('should produce different hashes for different inputs', () => {
      const a = scrubber.scrubValue('puuid-aaa', 'puuid')
      const b = scrubber.scrubValue('puuid-bbb', 'puuid')
      expect(a).not.toBe(b)
    })

    it('should return redacted placeholder in redact mode', () => {
      const redactScrubber = createPrivacyScrubber({ strategy: 'redact' })
      const result = redactScrubber.scrubValue('sensitive-puuid', 'puuid')
      expect(result).toBe('[REDACTED]')
    })

    it('should tokenize with reversible mapping', () => {
      const tokenScrubber = createPrivacyScrubber({ strategy: 'tokenize' })
      const token = tokenScrubber.scrubValue('real-puuid-value', 'puuid')
      expect(token).toMatch(/^tok_/)
      const resolved = tokenScrubber.resolveToken(token)
      expect(resolved).toBe('real-puuid-value')
    })

    it('should increment scrubCount', () => {
      expect(scrubber.scrubCount).toBe(0)
      scrubber.scrubValue('a', 'f')
      scrubber.scrubValue('b', 'f')
      expect(scrubber.scrubCount).toBe(2)
    })

    it('should track field stats', () => {
      scrubber.scrubValue('x', 'puuid')
      scrubber.scrubValue('y', 'puuid')
      scrubber.scrubValue('z', 'sessionId')
      const stats = scrubber.fieldStats
      expect(stats['puuid']).toBe(2)
      expect(stats['sessionId']).toBe(1)
    })

    it('should pass through empty strings', () => {
      expect(scrubber.scrubValue('', 'puuid')).toBe('')
    })
  })

  describe('scrubCaptureEvent', () => {
    const baseEvent: CaptureEvent = {
      id: 'cap-123',
      kind: 'advice-generated',
      timestamp: 1000,
      sessionId: 'ses-abc-12345678',
      gamePhase: 'champ-select' as GamePhase,
      payload: {
        adviceCount: 3,
        types: ['macro_strategy'],
        summonerName: 'TestPlayer',
        puuid: 'abcdef01-2345-6789-abcd-ef0123456789'
      }
    }

    it('should scrub PII fields in payload', () => {
      const result = scrubber.scrubCaptureEvent(baseEvent)
      expect(result.payload['summonerName']).not.toBe('TestPlayer')
      expect(result.payload['puuid']).not.toBe('abcdef01-2345-6789-abcd-ef0123456789')
    })

    it('should preserve non-PII fields in payload', () => {
      const result = scrubber.scrubCaptureEvent(baseEvent)
      expect(result.payload['adviceCount']).toBe(3)
      expect(result.id).toBe('cap-123')
      expect(result.kind).toBe('advice-generated')
      expect(result.gamePhase).toBe('champ-select')
    })

    it('should not scrub sessionId by default', () => {
      const result = scrubber.scrubCaptureEvent(baseEvent)
      expect(result.sessionId).toBe('ses-abc-12345678')
    })

    it('should scrub sessionId when configured', () => {
      const strictScrubber = createPrivacyScrubber({ scrubSessionIds: true })
      const result = strictScrubber.scrubCaptureEvent(baseEvent)
      expect(result.sessionId).not.toBe('ses-abc-12345678')
    })
  })

  describe('scrubTrainingSample', () => {
    const baseSample: TrainingSample = {
      featureVector: {
        selfWinRate: 0.55,
        selfKda: 2.1,
        selfChampWinRate: 0.6,
        selfChampGames: 10,
        selfCsPerMinute: 7.2,
        selfVisionScore: 20,
        selfKillParticipation: 0.6,
        selfDamageShare: 0.25,
        selfLosingStreak: 0,
        selfWinningStreak: 2,
        selfRankNumeric: 5,
        allyAvgWinRate: 0.5,
        allyAvgKda: 2.0,
        allyAvgDamageShare: 0.2,
        allyAvgTankiness: 0.15,
        allyAvgVision: 15,
        allyTeamCompleteness: 1.0,
        enemyAvgWinRate: 0.48,
        enemyAvgKda: 1.8,
        enemyAvgDamageShare: 0.2,
        enemyAvgTankiness: 0.16,
        enemyAvgVision: 14,
        enemyTeamCompleteness: 0.8,
        overallDelta: 0.05,
        comparisonConfidence: 0.7,
        gameMode: 0,
        queueType: 0,
        phaseOrdinal: 1,
        premadeGroupMaxSize: 2,
        rankGapMax: 3,
        laneRankGap: 1,
        allyPhysDamageShare: 0.4,
        allyMagicDamageShare: 0.35,
        dataCompletenessRatio: 0.9
      },
      advisedTypes: ['macro_strategy'],
      advisedPriorities: [3],
      advisedConfidences: [0.8],
      topAdviceType: 'macro_strategy',
      topAdvicePriority: 3,
      phaseLabel: 'champ-select',
      timestamp: 1000,
      sessionId: 'ses-test',
      outcome: 'win'
    }

    it('should preserve feature vector values unchanged', () => {
      const result = scrubber.scrubTrainingSample(baseSample)
      expect(result.featureVector.selfWinRate).toBe(0.55)
      expect(result.featureVector.selfKda).toBe(2.1)
      expect(result.featureVector.dataCompletenessRatio).toBe(0.9)
    })

    it('should preserve advice metadata', () => {
      const result = scrubber.scrubTrainingSample(baseSample)
      expect(result.topAdviceType).toBe('macro_strategy')
      expect(result.outcome).toBe('win')
    })

    it('should create independent copy of arrays', () => {
      const result = scrubber.scrubTrainingSample(baseSample)
      result.advisedTypes.push('extra')
      expect(baseSample.advisedTypes.length).toBe(1)
    })
  })

  describe('scrubSessionMeta', () => {
    const meta: CaptureSessionMeta = {
      sessionId: 'ses-meta-test',
      startedAt: 1000,
      endedAt: 2000,
      gameMode: 'CLASSIC',
      queueType: 'RANKED_SOLO_5x5',
      selfPuuid: 'real-puuid-abc-123-456-789-012345',
      eventCount: 10,
      sampleCount: 5,
      phases: ['champ-select' as GamePhase, 'early-game' as GamePhase]
    }

    it('should scrub selfPuuid by default', () => {
      const result = scrubber.scrubSessionMeta(meta)
      expect(result.selfPuuid).not.toBe('real-puuid-abc-123-456-789-012345')
    })

    it('should preserve non-PII meta fields', () => {
      const result = scrubber.scrubSessionMeta(meta)
      expect(result.gameMode).toBe('CLASSIC')
      expect(result.queueType).toBe('RANKED_SOLO_5x5')
      expect(result.eventCount).toBe(10)
      expect(result.sampleCount).toBe(5)
      expect(result.phases).toEqual(['champ-select', 'early-game'])
    })

    it('should create independent copy of phases array', () => {
      const result = scrubber.scrubSessionMeta(meta)
      result.phases.push('post-game' as GamePhase)
      expect(meta.phases.length).toBe(2)
    })
  })

  describe('scrubExportPayload', () => {
    it('should scrub all components of export payload', () => {
      const payload = {
        meta: {
          sessionId: 'ses-x',
          startedAt: 0,
          endedAt: 100,
          gameMode: 'CLASSIC',
          queueType: 'RANKED',
          selfPuuid: 'puuid-export-test-abcdef-1234567890',
          eventCount: 1,
          sampleCount: 1,
          phases: ['champ-select' as GamePhase]
        },
        events: [{
          id: 'e1',
          kind: 'advice-generated' as const,
          timestamp: 50,
          sessionId: 'ses-x',
          gamePhase: 'champ-select' as GamePhase,
          payload: { summonerName: 'Player1' }
        }],
        samples: [],
        accumulatorStats: { pipelineDuration: { avg: 10, min: 5, max: 15, count: 3 } }
      }

      const result = scrubber.scrubExportPayload(payload)
      expect(result.meta.selfPuuid).not.toBe('puuid-export-test-abcdef-1234567890')
      expect(result.events[0].payload['summonerName']).not.toBe('Player1')
      expect(result.accumulatorStats.pipelineDuration.avg).toBe(10)
    })
  })

  describe('scrubStreamMessage', () => {
    it('should scrub PII in stream message payload', () => {
      const msg = {
        type: 'capture-event',
        timestamp: 1000,
        sessionId: 'ses-stream',
        payload: {
          puuid: 'stream-puuid-abcdef-1234567890abcdef',
          championId: 1
        }
      }
      const result = scrubber.scrubStreamMessage(msg)
      expect((result.payload as any).puuid).not.toBe('stream-puuid-abcdef-1234567890abcdef')
      expect((result.payload as any).championId).toBe(1)
    })
  })

  describe('validateNoLeakedPii', () => {
    it('should detect leaked puuids', () => {
      const data = {
        events: [
          { payload: { nested: { value: 'known-puuid-123' } } }
        ]
      }
      const result = validateNoLeakedPii(data, ['known-puuid-123'])
      expect(result.clean).toBe(false)
      expect(result.leaks.length).toBe(1)
    })

    it('should pass when no puuids leak', () => {
      const data = { events: [{ payload: { value: 'safe-data' } }] }
      const result = validateNoLeakedPii(data, ['known-puuid-123'])
      expect(result.clean).toBe(true)
    })

    it('should detect partial puuid matches in concatenated strings', () => {
      const data = { field: 'prefix:known-puuid-123:suffix' }
      const result = validateNoLeakedPii(data, ['known-puuid-123'])
      expect(result.clean).toBe(false)
    })
  })

  describe('scrubPostGamePlayerStats', () => {
    it('should scrub puuid and preserve gameplay stats', () => {
      const stats = {
        puuid: 'real-puuid-for-scrub-test-1234567890',
        championId: 103,
        kills: 5,
        deaths: 2,
        assists: 8,
        kda: 6.5,
        goldEarned: 12000,
        damageDealt: 150000,
        damageDealtToChampions: 22000,
        damageTaken: 18000,
        items: [3031, 3006, 3085],
        championLevel: 16,
        subteamId: 100,
        subteamStanding: 1
      }
      const result = scrubber.scrubPostGamePlayerStats(stats)
      expect(result.puuid).not.toBe('real-puuid-for-scrub-test-1234567890')
      expect(result.championId).toBe(103)
      expect(result.kills).toBe(5)
      expect(result.kda).toBe(6.5)
      expect(result.items).toEqual([3031, 3006, 3085])
    })

    it('should create independent copy of items array', () => {
      const stats = {
        puuid: 'p1', championId: 1, kills: 0, deaths: 0, assists: 0,
        kda: 0, goldEarned: 0, damageDealt: 0, damageDealtToChampions: 0,
        damageTaken: 0, items: [1001], championLevel: 1, subteamId: 100,
        subteamStanding: 1
      }
      const result = scrubber.scrubPostGamePlayerStats(stats)
      result.items.push(9999)
      expect(stats.items.length).toBe(1)
    })
  })

  describe('lifecycle', () => {
    it('should reset stats independently of token map', () => {
      const tokenScrubber = createPrivacyScrubber({ strategy: 'tokenize' })
      const token = tokenScrubber.scrubValue('val', 'f')
      expect(tokenScrubber.scrubCount).toBe(1)
      tokenScrubber.resetStats()
      expect(tokenScrubber.scrubCount).toBe(0)
      expect(tokenScrubber.resolveToken(token)).toBe('val')
    })

    it('should clear everything on dispose', () => {
      const tokenScrubber = createPrivacyScrubber({ strategy: 'tokenize' })
      const token = tokenScrubber.scrubValue('val', 'f')
      tokenScrubber.dispose()
      expect(tokenScrubber.scrubCount).toBe(0)
      expect(tokenScrubber.resolveToken(token)).toBeNull()
    })
  })

  describe('nested payload scrubbing', () => {
    it('should recursively scrub nested objects', () => {
      const event: CaptureEvent = {
        id: 'nested-1',
        kind: 'team-comparison',
        timestamp: 1000,
        sessionId: 'ses-1',
        gamePhase: 'champ-select' as GamePhase,
        payload: {
          teamStats: {
            playerSummonerName: 'HiddenPlayer',
            innerPuuid: 'nested-puuid-abcdef-1234567890ab'
          },
          confidence: 0.8
        }
      }
      const result = scrubber.scrubCaptureEvent(event)
      const teamStats = result.payload['teamStats'] as Record<string, unknown>
      expect(teamStats['playerSummonerName']).not.toBe('HiddenPlayer')
    })

    it('should scrub arrays of objects in payload', () => {
      const event: CaptureEvent = {
        id: 'arr-1',
        kind: 'advice-generated',
        timestamp: 1000,
        sessionId: 'ses-1',
        gamePhase: 'champ-select' as GamePhase,
        payload: {
          players: [
            { summonerName: 'P1', score: 100 },
            { summonerName: 'P2', score: 200 }
          ]
        }
      }
      const result = scrubber.scrubCaptureEvent(event)
      const players = result.payload['players'] as Array<Record<string, unknown>>
      expect(players[0]['summonerName']).not.toBe('P1')
      expect(players[0]['score']).toBe(100)
      expect(players[1]['summonerName']).not.toBe('P2')
    })
  })
})
