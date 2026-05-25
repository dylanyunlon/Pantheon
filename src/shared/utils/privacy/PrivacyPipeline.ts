import type { CaptureEvent, TrainingSample, CaptureSessionMeta, FeatureVector } from "../capture/experiment-capture"
import type { PostGamePlayerStats, ReplayOutcome, ReplayAnalysisReport } from "../replay"
import type { PiiFieldCategory } from "./internal/PiiCacheKey"
import { createPiiCacheKey } from "./internal/PiiCacheKey"
import { PiiCacheKeys } from "./internal/PiiCacheKeys"
import { ScrubRefCounts } from "./internal/ScrubRefCounts"
import { ScrubChanges, createScrubChanges } from "./internal/ScrubChanges"
import { PiiCanonicalizer } from "./internal/PiiCanonicalizer"
import { AuditLog } from "./internal/audit/AuditLog"
import type { AuditEntry } from "./internal/audit/AuditLog"
import type { ComplianceViolation } from "./internal/audit/ComplianceReport"
import { generateComplianceReport, formatComplianceReport } from "./internal/audit/ComplianceReport"
import type { ComplianceReport } from "./internal/audit/ComplianceReport"
import { PiiFieldRegistry } from "./PiiFieldRegistry"
import type { PiiFieldRegistryConfig } from "./PiiFieldRegistry"
import { generateScrubOperationId } from "./internal/ScrubOperationId"
import { evaluatePiiValueHeuristic } from "./internal/evaluatePiiFilter"

export interface PrivacyPipelineConfig {
  enabled: boolean
  hashSalt: string
  redactedPlaceholder: string
  scrubPuuids: boolean
  scrubSessionIds: boolean
  scrubGameIds: boolean
  scrubPayloadStrings: boolean
  enableAuditLog: boolean
  auditLogMaxEntries: number
  enableComplianceChecks: boolean
  registry?: Partial<PiiFieldRegistryConfig>
}

const DEFAULT_PIPELINE_CONFIG: PrivacyPipelineConfig = {
  enabled: true,
  hashSalt: "pantheon-privacy-v1",
  redactedPlaceholder: "[REDACTED]",
  scrubPuuids: true,
  scrubSessionIds: false,
  scrubGameIds: false,
  scrubPayloadStrings: true,
  enableAuditLog: true,
  auditLogMaxEntries: 5000,
  enableComplianceChecks: true,
}

export class PrivacyPipeline {
  private _config: PrivacyPipelineConfig
  private _registry: PiiFieldRegistry
  private _canonicalizer: PiiCanonicalizer
  private _cacheKeys: PiiCacheKeys
  private _refCounts: ScrubRefCounts
  private _auditLog: AuditLog
  private _totalScrubs: number = 0
  private _sessionId: string = ""

  constructor(config?: Partial<PrivacyPipelineConfig>) {
    this._config = { ...DEFAULT_PIPELINE_CONFIG, ...config }
    this._registry = new PiiFieldRegistry(this._config.registry)
    this._canonicalizer = new PiiCanonicalizer()
    this._cacheKeys = new PiiCacheKeys()
    this._refCounts = new ScrubRefCounts()
    this._auditLog = new AuditLog(this._config.auditLogMaxEntries)
  }

  get config(): Readonly<PrivacyPipelineConfig> {
    return this._config
  }

  get registry(): PiiFieldRegistry {
    return this._registry
  }

  get auditLog(): AuditLog {
    return this._auditLog
  }

  get totalScrubs(): number {
    return this._totalScrubs
  }

  setSessionId(sessionId: string): void {
    this._sessionId = sessionId
  }

  scrubValue(value: string, fieldHint: string): string {
    if (!value || value.length === 0 || !this._config.enabled) return value
    const rule = this._registry.detectPii(fieldHint, value)
    if (!rule) return value

    const { result, action } = this._registry.scrubField(fieldHint, value, rule.category)
    this._totalScrubs++

    const key = createPiiCacheKey(fieldHint, rule.category, "pipeline")
    this._cacheKeys.retain(key)
    this._refCounts.retain(key)

    if (this._config.enableAuditLog) {
      const entry: AuditEntry = {
        operationId: generateScrubOperationId(),
        timestamp: Date.now(),
        fieldPath: fieldHint,
        category: rule.category,
        action,
        status: "scrubbed",
        originalLength: value.length,
        scrubbedLength: result.length,
        source: "pipeline",
        sessionId: this._sessionId,
      }
      this._auditLog.record(entry)
    }

    return result
  }

  scrubCaptureEvent(event: CaptureEvent): CaptureEvent {
    if (!this._config.enabled) return event
    return {
      id: event.id,
      kind: event.kind,
      timestamp: event.timestamp,
      sessionId: this._config.scrubSessionIds
        ? this.scrubValue(event.sessionId, "sessionId")
        : event.sessionId,
      gamePhase: event.gamePhase,
      payload: this._scrubPayload(event.payload, "event.payload"),
    }
  }

  scrubTrainingSample(sample: TrainingSample): TrainingSample {
    if (!this._config.enabled) return sample
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
        ? this.scrubValue(sample.sessionId, "sessionId")
        : sample.sessionId,
      outcome: sample.outcome,
    }
  }

  scrubSessionMeta(meta: CaptureSessionMeta): CaptureSessionMeta {
    if (!this._config.enabled) return meta
    return {
      sessionId: this._config.scrubSessionIds
        ? this.scrubValue(meta.sessionId, "sessionId")
        : meta.sessionId,
      startedAt: meta.startedAt,
      endedAt: meta.endedAt,
      gameMode: meta.gameMode,
      queueType: meta.queueType,
      selfPuuid: this._config.scrubPuuids
        ? this.scrubValue(meta.selfPuuid, "selfPuuid")
        : meta.selfPuuid,
      eventCount: meta.eventCount,
      sampleCount: meta.sampleCount,
      phases: [...meta.phases],
    }
  }

  scrubPostGamePlayerStats(stats: PostGamePlayerStats): PostGamePlayerStats {
    if (!this._config.enabled) return stats
    return {
      puuid: this._config.scrubPuuids
        ? this.scrubValue(stats.puuid, "puuid")
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
      subteamStanding: stats.subteamStanding,
    }
  }

  scrubReplayOutcome(outcome: ReplayOutcome): ReplayOutcome {
    if (!this._config.enabled) return outcome
    return {
      gameId: this._config.scrubGameIds ? 0 : outcome.gameId,
      selfPuuid: this._config.scrubPuuids
        ? this.scrubValue(outcome.selfPuuid, "selfPuuid")
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
      resolvedAt: outcome.resolvedAt,
    }
  }

  scrubReplayAnalysisReport(report: ReplayAnalysisReport): ReplayAnalysisReport {
    if (!this._config.enabled) return report
    return {
      gameId: this._config.scrubGameIds ? 0 : report.gameId,
      sessionId: this._config.scrubSessionIds
        ? this.scrubValue(report.sessionId, "sessionId")
        : report.sessionId,
      outcome: this.scrubReplayOutcome(report.outcome),
      backfilledSamples: report.backfilledSamples,
      adviceAccuracy: report.adviceAccuracy.map(a => ({
        ...a,
        reasoning: [...a.reasoning],
      })),
      overallAccuracy: report.overallAccuracy,
      performanceDelta: { ...report.performanceDelta },
      analyzedAt: report.analyzedAt,
    }
  }

  scrubExportPayload(payload: {
    meta: CaptureSessionMeta
    events: CaptureEvent[]
    samples: TrainingSample[]
    accumulatorStats: Record<string, { avg: number; min: number; max: number; count: number }>
  }): typeof payload {
    if (!this._config.enabled) return payload
    return {
      meta: this.scrubSessionMeta(payload.meta),
      events: payload.events.map(e => this.scrubCaptureEvent(e)),
      samples: payload.samples.map(s => this.scrubTrainingSample(s)),
      accumulatorStats: { ...payload.accumulatorStats },
    }
  }

  scrubStreamMessage(msg: {
    type: string
    timestamp: number
    sessionId: string
    payload: unknown
  }): typeof msg {
    if (!this._config.enabled) return msg
    return {
      type: msg.type,
      timestamp: msg.timestamp,
      sessionId: this._config.scrubSessionIds
        ? this.scrubValue(msg.sessionId, "sessionId")
        : msg.sessionId,
      payload: typeof msg.payload === "object" && msg.payload !== null
        ? this._scrubPayload(msg.payload as Record<string, unknown>, "stream.payload")
        : msg.payload,
    }
  }

  runComplianceScan(
    data: unknown,
    knownPuuids: string[],
  ): ComplianceReport {
    const scanStart = Date.now()
    const violations: ComplianceViolation[] = []
    let fieldsScanned = 0

    const walk = (obj: unknown, path: string): void => {
      if (typeof obj === "string") {
        fieldsScanned++
        for (const puuid of knownPuuids) {
          if (obj === puuid || obj.includes(puuid)) {
            violations.push({
              fieldPath: path,
              category: "puuid",
              value: obj.slice(0, 20) + "...",
              source: "compliance-scan",
              severity: "critical",
              description: `Leaked PUUID detected at ${path}`,
              detectedAt: Date.now(),
            })
          }
        }
        const heuristic = evaluatePiiValueHeuristic(obj)
        if (heuristic.isPii) {
          violations.push({
            fieldPath: path,
            category: heuristic.piiType as PiiFieldCategory,
            value: obj.slice(0, 10) + "...",
            source: "compliance-scan",
            severity: "warning",
            description: `Heuristic PII (${heuristic.piiType}) at ${path}`,
            detectedAt: Date.now(),
          })
        }
        return
      }
      if (Array.isArray(obj)) {
        obj.forEach((item, i) => walk(item, `${path}[${i}]`))
        return
      }
      if (typeof obj === "object" && obj !== null) {
        for (const [key, value] of Object.entries(obj)) {
          fieldsScanned++
          const fullPath = path ? `${path}.${key}` : key
          if (this._registry.isBlocked(key) && typeof value === "string") {
            violations.push({
              fieldPath: fullPath,
              category: (this._registry.detectPii(key, value)?.category || "composite") as PiiFieldCategory,
              value: typeof value === "string" ? value.slice(0, 10) + "..." : "[non-string]",
              source: "compliance-scan",
              severity: "critical",
              description: `Blocked field "${key}" found unscrubbed at ${fullPath}`,
              detectedAt: Date.now(),
            })
          }
          walk(value, fullPath)
        }
      }
    }

    walk(data, "")
    return generateComplianceReport(this._auditLog, violations, fieldsScanned, scanStart)
  }

  getStats(): {
    enabled: boolean
    totalScrubs: number
    auditLogSize: number
    cacheKeyCount: number
    refCountTotal: number
    canonicalizerCacheSize: number
    hashCacheSize: number
  } {
    return {
      enabled: this._config.enabled,
      totalScrubs: this._totalScrubs,
      auditLogSize: this._auditLog.length,
      cacheKeyCount: this._cacheKeys.size,
      refCountTotal: this._refCounts.totalScrubs,
      canonicalizerCacheSize: this._canonicalizer.cacheSize,
      hashCacheSize: this._canonicalizer.hashCacheSize,
    }
  }

  clear(): void {
    this._totalScrubs = 0
    this._cacheKeys.clear()
    this._refCounts.clear()
    this._canonicalizer.clear()
    this._auditLog.clear()
  }

  dispose(): void {
    this.clear()
    this._registry.dispose()
    this._auditLog.dispose()
  }

  private _scrubPayload(
    payload: Record<string, unknown>,
    parentPath: string,
    depth: number = 0,
  ): Record<string, unknown> {
    if (!payload || typeof payload !== "object" || depth > 10) return payload
    const result: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(payload)) {
      const fullPath = `${parentPath}.${key}`

      if (this._registry.isAllowed(key)) {
        result[key] = value
        continue
      }

      const rule = this._registry.detectPii(key, value)
      if (rule) {
        if (typeof value === "string") {
          result[key] = this.scrubValue(value, key)
        } else if (Array.isArray(value)) {
          result[key] = value.map(v =>
            typeof v === "string" ? this.scrubValue(v, key) : v
          )
        } else {
          result[key] = this._config.redactedPlaceholder
        }
        continue
      }

      if (typeof value === "string" && this._config.scrubPayloadStrings) {
        const heuristic = evaluatePiiValueHeuristic(value)
        if (heuristic.isPii && this._config.scrubPuuids) {
          result[key] = this.scrubValue(value, key)
          continue
        }
      }

      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        result[key] = this._scrubPayload(value as Record<string, unknown>, fullPath, depth + 1)
        continue
      }

      if (Array.isArray(value)) {
        result[key] = value.map(item => {
          if (typeof item === "object" && item !== null) {
            return this._scrubPayload(item as Record<string, unknown>, fullPath, depth + 1)
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

export function createPrivacyPipeline(
  config?: Partial<PrivacyPipelineConfig>,
): PrivacyPipeline {
  return new PrivacyPipeline(config)
}
