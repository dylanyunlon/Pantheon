// @ts-nocheck
import type {
  CaptureEvent,
  TrainingSample,
  CaptureSessionMeta,
  FeatureVector
} from './experiment-capture'
import type { PostGamePlayerStats, ReplayOutcome, ReplayAnalysisReport } from '../coach-replay'

export type ScrubStrategy = 'hash' | 'redact' | 'tokenize'

export interface PrivacyScrubberConfig {
  strategy: ScrubStrategy
  hashSalt: string
  redactedPlaceholder: string
  tokenPrefix: string
  scrubPuuids: boolean
  scrubSessionIds: boolean
  scrubPayloadStrings: boolean
  scrubGameIds: boolean
  piiFieldPatterns: RegExp[]
  allowlist: Set<string>
  knownPuuids?: string[]
  knownPuuids?: string[]
}

const DEFAULT_CONFIG: PrivacyScrubberConfig = {
  strategy: 'hash',
  hashSalt: 'pantheon-coach-privacy-v1',
  redactedPlaceholder: '[REDACTED]',
  tokenPrefix: 'tok_',
  scrubPuuids: true,
  scrubSessionIds: false,
  scrubPayloadStrings: true,
  scrubGameIds: false,
  piiFieldPatterns: [
    /puuid/i,
    /summoner/i,
    /displayName/i,
    /gameName/i,
    /tagLine/i,
    /accountId/i,
    /playerName/i,
    /internalName/i
  ],
  allowlist: new Set([
    'gameMode',
    'queueType',
    'gamePhase',
    'championName',
    'championId',
    'type',
    'kind',
    'outcome',
    'phase',
    'from',
    'to',
    'feedback',
    'adviceType',
    'title',
    'message',
    'reasoning'
  ])
}

interface TokenMap {
  forward: Map<string, string>
  reverse: Map<string, string>
  counter: number
}

function djb2Hash(input: string): string {
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0
  }
  return hash.toString(36)
}

function sha256Lite(input: string, salt: string): string {
  const combined = salt + ':' + input
  let h0 = 0x6a09e667
  let h1 = 0xbb67ae85
  let h2 = 0x3c6ef372
  let h3 = 0xa54ff53a

  for (let i = 0; i < combined.length; i++) {
    const ch = combined.charCodeAt(i)
    h0 = ((h0 ^ ch) * 0x01000193) >>> 0
    h1 = ((h1 ^ (ch << 3)) * 0x01000193) >>> 0
    h2 = ((h2 ^ (ch << 7)) * 0x01000193) >>> 0
    h3 = ((h3 ^ (ch << 11)) * 0x01000193) >>> 0
  }

  const p0 = h0.toString(16).padStart(8, '0')
  const p1 = h1.toString(16).padStart(8, '0')
  const p2 = h2.toString(16).padStart(8, '0')
  const p3 = h3.toString(16).padStart(8, '0')
  return p0 + p1 + p2 + p3
}

function isPuuidPattern(value: string): boolean {
  if (value.length < 20) return false
  return /^[a-f0-9-]{30,80}$/i.test(value)
}

function isSessionIdPattern(value: string): boolean {
  return /^ses-[a-z0-9]+-[a-z0-9]+$/.test(value)
}

function looksLikePii(key: string, patterns: RegExp[]): boolean {
  for (const pattern of patterns) {
    if (pattern.test(key)) return true
  }
  return false
}

export class PrivacyScrubber {
  private _config: PrivacyScrubberConfig
  private _tokenMap: TokenMap
  private _scrubCount: number = 0
  private _fieldsScrubbed: Map<string, number> = new Map()

  constructor(config?: Partial<PrivacyScrubberConfig>) {
    this._config = { ...DEFAULT_CONFIG, ...config }
    if (config?.piiFieldPatterns) {
      this._config.piiFieldPatterns = config.piiFieldPatterns
    }
    if (config?.allowlist) {
      this._config.allowlist = config.allowlist
    }
    this._tokenMap = { forward: new Map(), reverse: new Map(), counter: 0 }
  }

  get config(): Readonly<PrivacyScrubberConfig> {
    return this._config
  }

  get scrubCount(): number {
    return this._scrubCount
  }

  get fieldStats(): Record<string, number> {
    const result: Record<string, number> = {}
    for (const [k, v] of this._fieldsScrubbed) {
      result[k] = v
    }
    return result
  }

  scrubValue(value: string, fieldHint?: string): string {
    if (!value || value.length === 0) return value
    this._scrubCount++
    if (fieldHint) {
      this._fieldsScrubbed.set(fieldHint, (this._fieldsScrubbed.get(fieldHint) || 0) + 1)
    }

    switch (this._config.strategy) {
      case 'hash':
        return sha256Lite(value, this._config.hashSalt)
      case 'redact':
        return this._config.redactedPlaceholder
      case 'tokenize':
        return this._tokenize(value)
    }
  }

  scrubCaptureEvent(event: CaptureEvent): CaptureEvent {
    const scrubbed: CaptureEvent = {
      id: event.id,
      kind: event.kind,
      timestamp: event.timestamp,
      sessionId: this._config.scrubSessionIds
        ? this.scrubValue(event.sessionId, 'sessionId')
        : event.sessionId,
      gamePhase: event.gamePhase,
      payload: this._scrubPayload(event.payload)
    }
    return scrubbed
  }

  scrubTrainingSample(sample: TrainingSample): TrainingSample {
    return {
      featureVector: { ...sample.featureVector },
      advisedTypes: [...sample.advisedTypes],
      advisedPriorities: [...sample.advisedPriorities],
      advisedConfidences: [...sample.advisedConfidences],
      topAdviceType: sample.topAdviceType,
      topAdvicePriority: sample.topAdvicePriority,
      phaseLabel: sample.phaseLabel,
      timestamp: sample.timestamp,
      sessionId: this._config.scrubSessionIds
        ? this.scrubValue(sample.sessionId, 'sessionId')
        : sample.sessionId,
      outcome: sample.outcome
    }
  }

  scrubSessionMeta(meta: CaptureSessionMeta): CaptureSessionMeta {
    return {
      sessionId: this._config.scrubSessionIds
        ? this.scrubValue(meta.sessionId, 'sessionId')
        : meta.sessionId,
      startedAt: meta.startedAt,
      endedAt: meta.endedAt,
      gameMode: meta.gameMode,
      queueType: meta.queueType,
      selfPuuid: this._config.scrubPuuids
        ? this.scrubValue(meta.selfPuuid, 'selfPuuid')
        : meta.selfPuuid,
      eventCount: meta.eventCount,
      sampleCount: meta.sampleCount,
      phases: [...meta.phases]
    }
  }

  scrubPostGamePlayerStats(stats: PostGamePlayerStats): PostGamePlayerStats {
    return {
      puuid: this._config.scrubPuuids
        ? this.scrubValue(stats.puuid, 'puuid')
        : stats.puuid,
      championId: stats.championId,
      kills: stats.kills,
      deaths: stats.deaths,
      assists: stats.assists,
      kda: stats.kda,
      goldEarned: stats.goldEarned,
      damageDealt: stats.damageDealt,
      damageDealtToChampions: stats.damageDealtToChampions,
      damageTaken: stats.damageTaken,
      items: [...stats.items],
      championLevel: stats.championLevel,
      subteamId: stats.subteamId,
      subteamStanding: stats.subteamStanding
    }
  }

  scrubReplayOutcome(outcome: ReplayOutcome): ReplayOutcome {
    return {
      gameId: this._config.scrubGameIds ? 0 : outcome.gameId,
      selfPuuid: this._config.scrubPuuids
        ? this.scrubValue(outcome.selfPuuid, 'selfPuuid')
        : outcome.selfPuuid,
      outcome: outcome.outcome,
      selfStats: outcome.selfStats
        ? this.scrubPostGamePlayerStats(outcome.selfStats)
        : null,
      gameDurationSeconds: outcome.gameDurationSeconds,
      gameMode: outcome.gameMode,
      queueType: outcome.queueType,
      isRanked: outcome.isRanked,
      allPlayers: outcome.allPlayers.map(p => this.scrubPostGamePlayerStats(p)),
      selfTeamPlayers: outcome.selfTeamPlayers.map(p => this.scrubPostGamePlayerStats(p)),
      enemyTeamPlayers: outcome.enemyTeamPlayers.map(p => this.scrubPostGamePlayerStats(p)),
      resolvedAt: outcome.resolvedAt
    }
  }

  scrubReplayAnalysisReport(report: ReplayAnalysisReport): ReplayAnalysisReport {
    return {
      gameId: this._config.scrubGameIds ? 0 : report.gameId,
      sessionId: this._config.scrubSessionIds
        ? this.scrubValue(report.sessionId, 'sessionId')
        : report.sessionId,
      outcome: this.scrubReplayOutcome(report.outcome),
      backfilledSamples: report.backfilledSamples,
      adviceAccuracy: report.adviceAccuracy.map(a => ({ ...a, reasoning: [...a.reasoning] })),
      overallAccuracy: report.overallAccuracy,
      performanceDelta: { ...report.performanceDelta },
      analyzedAt: report.analyzedAt
    }
  }

  scrubExportPayload(payload: {
    meta: CaptureSessionMeta
    events: CaptureEvent[]
    samples: TrainingSample[]
    accumulatorStats: Record<string, { avg: number; min: number; max: number; count: number }>
  }): {
    meta: CaptureSessionMeta
    events: CaptureEvent[]
    samples: TrainingSample[]
    accumulatorStats: Record<string, { avg: number; min: number; max: number; count: number }>
  } {
    return {
      meta: this.scrubSessionMeta(payload.meta),
      events: payload.events.map(e => this.scrubCaptureEvent(e)),
      samples: payload.samples.map(s => this.scrubTrainingSample(s)),
      accumulatorStats: { ...payload.accumulatorStats }
    }
  }

  scrubStreamMessage(msg: { type: string; timestamp: number; sessionId: string; payload: unknown }): {
    type: string; timestamp: number; sessionId: string; payload: unknown
  } {
    return {
      type: msg.type,
      timestamp: msg.timestamp,
      sessionId: this._config.scrubSessionIds
        ? this.scrubValue(msg.sessionId, 'sessionId')
        : msg.sessionId,
      payload: this._scrubPayload(msg.payload as Record<string, unknown>)
    }
  }

  resolveToken(token: string): string | null {
    if (this._config.strategy !== 'tokenize') return null
    return this._tokenMap.reverse.get(token) || null
  }

  resetTokenMap(): void {
    this._tokenMap = { forward: new Map(), reverse: new Map(), counter: 0 }
  }

  resetStats(): void {
    this._scrubCount = 0
    this._fieldsScrubbed.clear()
  }

  dispose(): void {
    this.resetTokenMap()
    this.resetStats()
  }

  private _tokenize(value: string): string {
    const existing = this._tokenMap.forward.get(value)
    if (existing) return existing
    this._tokenMap.counter++
    const token = this._config.tokenPrefix + this._tokenMap.counter.toString(36).padStart(6, '0')
    this._tokenMap.forward.set(value, token)
    this._tokenMap.reverse.set(token, value)
    return token
  }

  private _scrubPayload(payload: Record<string, unknown>): Record<string, unknown> {
    if (!payload || typeof payload !== 'object') return payload
    const result: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(payload)) {
      if (this._config.allowlist.has(key)) {
        result[key] = value
        continue
      }

      if (looksLikePii(key, this._config.piiFieldPatterns)) {
        if (typeof value === 'string') {
          result[key] = this.scrubValue(value, key)
        } else if (Array.isArray(value)) {
          result[key] = value.map(v =>
            typeof v === 'string' ? this.scrubValue(v, key) : v
          )
        } else {
          result[key] = this._config.redactedPlaceholder
        }
        continue
      }

      if (typeof value === 'string' && this._config.scrubPayloadStrings) {
        if (isPuuidPattern(value) && this._config.scrubPuuids) {
          result[key] = this.scrubValue(value, key)
          continue
        }
        if (isSessionIdPattern(value) && this._config.scrubSessionIds) {
          result[key] = this.scrubValue(value, key)
          continue
        }
      }

      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        result[key] = this._scrubPayload(value as Record<string, unknown>)
        continue
      }

      if (Array.isArray(value)) {
        result[key] = value.map(item => {
          if (typeof item === 'object' && item !== null) {
            return this._scrubPayload(item as Record<string, unknown>)
          }
          return item
        })
        continue
      }

      result[key] = value
    }

    return result
  }
}

export function createPrivacyScrubber(config?: Partial<PrivacyScrubberConfig>): PrivacyScrubber {
  return new PrivacyScrubber(config)
}

export function scrubPuuidInPlace(
  obj: Record<string, unknown>,
  scrubber: PrivacyScrubber
): void {
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string' && looksLikePii(key, DEFAULT_CONFIG.piiFieldPatterns)) {
      obj[key] = scrubber.scrubValue(value, key)
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      scrubPuuidInPlace(value as Record<string, unknown>, scrubber)
    }
  }
}

export function validateNoLeakedPii(
  data: unknown,
  knownPuuids: string[]
): { clean: boolean; leaks: Array<{ path: string; value: string }> } {
  const leaks: Array<{ path: string; value: string }> = []

  function walk(obj: unknown, path: string): void {
    if (typeof obj === 'string') {
      for (const puuid of knownPuuids) {
        if (obj === puuid || obj.includes(puuid)) {
          leaks.push({ path, value: obj.slice(0, 40) })
        }
      }
      return
    }
    if (Array.isArray(obj)) {
      obj.forEach((item, i) => walk(item, `${path}[${i}]`))
      return
    }
    if (typeof obj === 'object' && obj !== null) {
      for (const [key, value] of Object.entries(obj)) {
        walk(value, path ? `${path}.${key}` : key)
      }
    }
  }

  walk(data, '')
  return { clean: leaks.length === 0, leaks }
}
