// @ts-nocheck
/**
 * NexusPrivacyScrubber — data sanitization for experiment export
 *
 * Algorithmic changes from Pantheon PrivacyScrubber:
 *   1. sha256Lite uses FNV-1a variant instead of shifted multiply
 *   2. isPuuidPattern tightened: min length 36 (UUID-length), added dash-count check
 *   3. _scrubPayload recurses arrays-of-objects with depth limit (max 8) to prevent stack overflow
 *   4. New cascadeScrub mode: when enabled, any scrubbed field triggers re-scan of sibling fields
 *   5. tokenize uses base62 encoding instead of base36 for denser tokens
 *   6. validateNoLeakedPii returns severity levels (exact vs partial match)
 *
 * Debug instrumentation:
 *   - introspector checkpoint on every scrubCaptureEvent / scrubTrainingSample
 *   - debugPrintScrubReport() for console-friendly summary
 */

import { NexusIntrospector } from '../debug/introspector'

const introspector = NexusIntrospector.getInstance()

// ── Types ──────────────────────────────────────────────────────────────

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
  maxRecursionDepth: number         // NEW: depth limit for payload scrub
  enableCascadeScrub: boolean       // NEW: re-scan siblings after scrub
}

const DEFAULT_CONFIG: PrivacyScrubberConfig = {
  strategy: 'hash',
  hashSalt: 'nexus-privacy-v2',     // changed salt
  redactedPlaceholder: '[SCRUBBED]', // changed placeholder
  tokenPrefix: 'ntk_',              // changed prefix
  scrubPuuids: true,
  scrubSessionIds: false,
  scrubPayloadStrings: true,
  scrubGameIds: false,
  maxRecursionDepth: 8,             // NEW
  enableCascadeScrub: false,        // NEW
  piiFieldPatterns: [
    /puuid/i,
    /summoner/i,
    /displayName/i,
    /gameName/i,
    /tagLine/i,
    /accountId/i,
    /playerName/i,
    /internalName/i,
    /riotId/i                       // NEW pattern
  ],
  allowlist: new Set([
    'gameMode', 'queueType', 'gamePhase', 'championName',
    'championId', 'type', 'kind', 'outcome', 'phase',
    'from', 'to', 'feedback', 'adviceType', 'title',
    'message', 'reasoning', 'team', 'position'  // added team/position
  ])
}

interface TokenMap {
  forward: Map<string, string>
  reverse: Map<string, string>
  counter: number
}

// ── Hashing (FNV-1a variant, changed from original djb2/sha256lite) ──

const FNV_OFFSET = 0x811c9dc5
const FNV_PRIME  = 0x01000193

function fnv1aHash(input: string, salt: string): string {
  const combined = salt + ':' + input
  let h0 = FNV_OFFSET
  let h1 = FNV_OFFSET ^ 0x12345678
  let h2 = FNV_OFFSET ^ 0x9abcdef0
  let h3 = FNV_OFFSET ^ 0xdeadbeef

  for (let i = 0; i < combined.length; i++) {
    const ch = combined.charCodeAt(i)
    h0 = ((h0 ^ ch) * FNV_PRIME) >>> 0
    h1 = ((h1 ^ (ch << 4)) * FNV_PRIME) >>> 0
    h2 = ((h2 ^ (ch << 8)) * FNV_PRIME) >>> 0
    h3 = ((h3 ^ (ch << 12)) * FNV_PRIME) >>> 0
  }

  const p0 = h0.toString(16).padStart(8, '0')
  const p1 = h1.toString(16).padStart(8, '0')
  const p2 = h2.toString(16).padStart(8, '0')
  const p3 = h3.toString(16).padStart(8, '0')
  return p0 + p1 + p2 + p3
}

// ── Detection helpers ──────────────────────────────────────────────────

function isPuuidPattern(value: string): boolean {
  if (value.length < 36) return false                    // tightened from 20→36
  if (!/^[a-f0-9-]{36,80}$/i.test(value)) return false
  const dashCount = (value.match(/-/g) || []).length
  return dashCount >= 4                                  // NEW: must have UUID-like dashes
}

function isSessionIdPattern(value: string): boolean {
  return /^ses-[a-z0-9]+-[a-z0-9]+$/.test(value) ||
         /^liv-[a-z0-9]+-[a-z0-9]+$/.test(value)       // also match live-ingestor sessions
}

function looksLikePii(key: string, patterns: RegExp[]): boolean {
  for (const pattern of patterns) {
    if (pattern.test(key)) return true
  }
  return false
}

// ── Base62 for token encoding (changed from base36) ────────────────────

const BASE62_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

function toBase62(n: number): string {
  if (n === 0) return '0'
  let result = ''
  let val = n
  while (val > 0) {
    result = BASE62_CHARS[val % 62] + result
    val = Math.floor(val / 62)
  }
  return result
}

// ── Scrubber class ─────────────────────────────────────────────────────

export class NexusPrivacyScrubber {
  private _config: PrivacyScrubberConfig
  private _tokenMap: TokenMap
  private _scrubCount: number = 0
  private _fieldsScrubbed: Map<string, number> = new Map()
  private _cascadeRescans: number = 0

  constructor(config?: Partial<PrivacyScrubberConfig>) {
    this._config = { ...DEFAULT_CONFIG, ...config }
    if (config?.piiFieldPatterns) {
      this._config.piiFieldPatterns = config.piiFieldPatterns
    }
    if (config?.allowlist) {
      this._config.allowlist = config.allowlist
    }
    this._tokenMap = { forward: new Map(), reverse: new Map(), counter: 0 }

    introspector.registerProbe('privacy-scrubber', () => ({
      strategy: this._config.strategy,
      scrubCount: this._scrubCount,
      tokenMapSize: this._tokenMap.forward.size,
      cascadeRescans: this._cascadeRescans,
      topFields: Object.fromEntries(
        [...this._fieldsScrubbed.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
      )
    }))
  }

  get config(): Readonly<PrivacyScrubberConfig> { return this._config }
  get scrubCount(): number { return this._scrubCount }

  get fieldStats(): Record<string, number> {
    const result: Record<string, number> = {}
    for (const [k, v] of this._fieldsScrubbed) result[k] = v
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
        return fnv1aHash(value, this._config.hashSalt)   // uses FNV-1a now
      case 'redact':
        return this._config.redactedPlaceholder
      case 'tokenize':
        return this._tokenize(value)
    }
  }

  scrubCaptureEvent(event: any): any {
    introspector.checkpoint('scrub-capture-event', {
      eventId: event.id, kind: event.kind, fieldCount: Object.keys(event.payload || {}).length
    })

    const scrubbed = {
      id: event.id,
      kind: event.kind,
      timestamp: event.timestamp,
      sessionId: this._config.scrubSessionIds
        ? this.scrubValue(event.sessionId, 'sessionId')
        : event.sessionId,
      gamePhase: event.gamePhase,
      payload: this._scrubPayload(event.payload, 0),
      __debug_scrubbedAt: Date.now()                     // NEW debug field
    }
    return scrubbed
  }

  scrubTrainingSample(sample: any): any {
    introspector.checkpoint('scrub-training-sample', {
      phaseLabel: sample.phaseLabel, topAdviceType: sample.topAdviceType
    })

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

  scrubSessionMeta(meta: any): any {
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

  scrubPlayerStats(stats: any): any {
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

  scrubReplayOutcome(outcome: any): any {
    return {
      gameId: this._config.scrubGameIds ? 0 : outcome.gameId,
      selfPuuid: this._config.scrubPuuids
        ? this.scrubValue(outcome.selfPuuid, 'selfPuuid')
        : outcome.selfPuuid,
      outcome: outcome.outcome,
      selfStats: outcome.selfStats
        ? this.scrubPlayerStats(outcome.selfStats) : null,
      gameDurationSeconds: outcome.gameDurationSeconds,
      gameMode: outcome.gameMode,
      queueType: outcome.queueType,
      isRanked: outcome.isRanked,
      allPlayers: outcome.allPlayers.map((p: any) => this.scrubPlayerStats(p)),
      selfTeamPlayers: outcome.selfTeamPlayers.map((p: any) => this.scrubPlayerStats(p)),
      enemyTeamPlayers: outcome.enemyTeamPlayers.map((p: any) => this.scrubPlayerStats(p)),
      resolvedAt: outcome.resolvedAt
    }
  }

  scrubReplayAnalysisReport(report: any): any {
    return {
      gameId: this._config.scrubGameIds ? 0 : report.gameId,
      sessionId: this._config.scrubSessionIds
        ? this.scrubValue(report.sessionId, 'sessionId')
        : report.sessionId,
      outcome: this.scrubReplayOutcome(report.outcome),
      backfilledSamples: report.backfilledSamples,
      adviceAccuracy: report.adviceAccuracy.map((a: any) => ({ ...a, reasoning: [...a.reasoning] })),
      overallAccuracy: report.overallAccuracy,
      performanceDelta: { ...report.performanceDelta },
      analyzedAt: report.analyzedAt
    }
  }

  scrubExportPayload(payload: {
    meta: any; events: any[]; samples: any[]
    accumulatorStats: Record<string, { avg: number; min: number; max: number; count: number }>
  }) {
    return {
      meta: this.scrubSessionMeta(payload.meta),
      events: payload.events.map(e => this.scrubCaptureEvent(e)),
      samples: payload.samples.map(s => this.scrubTrainingSample(s)),
      accumulatorStats: { ...payload.accumulatorStats }
    }
  }

  scrubStreamMessage(msg: { type: string; timestamp: number; sessionId: string; payload: unknown }) {
    return {
      type: msg.type,
      timestamp: msg.timestamp,
      sessionId: this._config.scrubSessionIds
        ? this.scrubValue(msg.sessionId, 'sessionId')
        : msg.sessionId,
      payload: this._scrubPayload(msg.payload as Record<string, unknown>, 0)
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
    this._cascadeRescans = 0
  }

  dispose(): void {
    this.resetTokenMap()
    this.resetStats()
  }

  // ── Private ─────────────────────────────────────────────────────

  private _tokenize(value: string): string {
    const existing = this._tokenMap.forward.get(value)
    if (existing) return existing
    this._tokenMap.counter++
    // base62 instead of base36 for denser tokens
    const token = this._config.tokenPrefix + toBase62(this._tokenMap.counter).padStart(5, '0')
    this._tokenMap.forward.set(value, token)
    this._tokenMap.reverse.set(token, value)
    return token
  }

  private _scrubPayload(payload: Record<string, unknown>, depth: number): Record<string, unknown> {
    if (!payload || typeof payload !== 'object') return payload
    if (depth >= this._config.maxRecursionDepth) return payload      // NEW: depth guard

    const result: Record<string, unknown> = {}
    let anyScrubbed = false

    for (const [key, value] of Object.entries(payload)) {
      if (this._config.allowlist.has(key)) {
        result[key] = value
        continue
      }

      if (looksLikePii(key, this._config.piiFieldPatterns)) {
        if (typeof value === 'string') {
          result[key] = this.scrubValue(value, key)
          anyScrubbed = true
        } else if (Array.isArray(value)) {
          result[key] = value.map(v =>
            typeof v === 'string' ? this.scrubValue(v, key) : v
          )
          anyScrubbed = true
        } else {
          result[key] = this._config.redactedPlaceholder
          anyScrubbed = true
        }
        continue
      }

      if (typeof value === 'string' && this._config.scrubPayloadStrings) {
        if (isPuuidPattern(value) && this._config.scrubPuuids) {
          result[key] = this.scrubValue(value, key)
          anyScrubbed = true
          continue
        }
        if (isSessionIdPattern(value) && this._config.scrubSessionIds) {
          result[key] = this.scrubValue(value, key)
          anyScrubbed = true
          continue
        }
      }

      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        result[key] = this._scrubPayload(value as Record<string, unknown>, depth + 1)
        continue
      }

      if (Array.isArray(value)) {
        result[key] = value.map(item => {
          if (typeof item === 'object' && item !== null) {
            return this._scrubPayload(item as Record<string, unknown>, depth + 1)
          }
          return item
        })
        continue
      }

      result[key] = value
    }

    // NEW: cascade re-scan — if anything was scrubbed, re-check unscrubbed string siblings
    if (anyScrubbed && this._config.enableCascadeScrub) {
      this._cascadeRescans++
      for (const [key, value] of Object.entries(result)) {
        if (typeof value === 'string' && !this._config.allowlist.has(key)) {
          if (isPuuidPattern(value)) {
            result[key] = this.scrubValue(value, `cascade:${key}`)
          }
        }
      }
    }

    return result
  }
}

// ── Standalone helpers ─────────────────────────────────────────────────

export function createPrivacyScrubber(config?: Partial<PrivacyScrubberConfig>): NexusPrivacyScrubber {
  return new NexusPrivacyScrubber(config)
}

export function scrubPuuidInPlace(
  obj: Record<string, unknown>,
  scrubber: NexusPrivacyScrubber
): void {
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string' && looksLikePii(key, DEFAULT_CONFIG.piiFieldPatterns)) {
      obj[key] = scrubber.scrubValue(value, key)
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      scrubPuuidInPlace(value as Record<string, unknown>, scrubber)
    }
  }
}

export type PiiLeakSeverity = 'exact' | 'partial'     // NEW: severity levels

export function validateNoLeakedPii(
  data: unknown,
  knownPuuids: string[]
): { clean: boolean; leaks: Array<{ path: string; value: string; severity: PiiLeakSeverity }> } {
  const leaks: Array<{ path: string; value: string; severity: PiiLeakSeverity }> = []

  function walk(obj: unknown, path: string): void {
    if (typeof obj === 'string') {
      for (const puuid of knownPuuids) {
        if (obj === puuid) {
          leaks.push({ path, value: obj.slice(0, 40), severity: 'exact' })
        } else if (obj.includes(puuid)) {
          leaks.push({ path, value: obj.slice(0, 40), severity: 'partial' })
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

// ── Debug ──────────────────────────────────────────────────────────────

export function debugPrintScrubReport(scrubber: NexusPrivacyScrubber): void {
  const stats = scrubber.fieldStats
  const sorted = Object.entries(stats).sort((a, b) => b[1] - a[1])

  console.log('\n╔═══════════════════════════════════════╗')
  console.log('║   NexusPrivacyScrubber — Scrub Report ║')
  console.log('╠═══════════════════════════════════════╣')
  console.log(`║ Strategy:    ${scrubber.config.strategy.padEnd(24)}║`)
  console.log(`║ Total scrubs: ${String(scrubber.scrubCount).padEnd(23)}║`)
  console.log('╠═══════════════════════════════════════╣')
  console.log('║ Field breakdown:                      ║')
  for (const [field, count] of sorted.slice(0, 15)) {
    const bar = '█'.repeat(Math.min(20, Math.round(count / Math.max(1, scrubber.scrubCount) * 20)))
    console.log(`║  ${field.padEnd(16)} ${String(count).padStart(5)} ${bar.padEnd(20)}║`)
  }
  console.log('╚═══════════════════════════════════════╝\n')
}
