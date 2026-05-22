import type { PiiFieldCategory } from "./internal/PiiCacheKey"
import { DEFAULT_PII_RULES, matchRule, matchAllRules } from "./internal/rules/PiiDetectionRule"
import type { PiiDetectionRule } from "./internal/rules/PiiDetectionRule"
import { DEFAULT_SCRUB_STRATEGIES, getStrategyForCategory, applyScrubAction } from "./internal/rules/ScrubStrategyRule"
import type { ScrubStrategyRule, ScrubAction } from "./internal/rules/ScrubStrategyRule"
import { PiiCanonicalizer } from "./internal/PiiCanonicalizer"

export type PiiFilterType =
  | "$eq" | "$gt" | "$lt" | "$gte" | "$lte" | "$ne"
  | "$in" | "$isNull" | "$startsWith" | "$contains"
  | "$matchesPuuid" | "$matchesSummonerName"
  | "$matchesAccountId" | "$matchesTagLine"
  | "$matchesSessionKey" | "$interval" | "$matchesRegex"

export interface PiiFieldRegistryConfig {
  detectionRules: PiiDetectionRule[]
  scrubStrategies: ScrubStrategyRule[]
  allowlist: Set<string>
  blocklistPatterns: RegExp[]
  enableHeuristicDetection: boolean
  maxDepth: number
}

const DEFAULT_REGISTRY_CONFIG: PiiFieldRegistryConfig = {
  detectionRules: DEFAULT_PII_RULES,
  scrubStrategies: DEFAULT_SCRUB_STRATEGIES,
  allowlist: new Set([
    "gameMode", "queueType", "gamePhase", "championId", "championName",
    "type", "kind", "outcome", "phase", "from", "to", "feedback",
    "adviceType", "title", "message", "reasoning", "confidence",
    "priority", "audience", "kills", "deaths", "assists", "kda",
    "goldEarned", "damageDealt", "items", "subteamId", "subteamStanding",
    "championLevel", "damageTaken", "damageDealtToChampions",
    "adviceCount", "types", "priorities", "confidences", "audiences",
    "pipelineDurationMs", "overallDelta", "allyCompleteness",
    "enemyCompleteness", "featureVector",
  ]),
  blocklistPatterns: [
    /puuid/i, /summoner/i, /displayName/i, /gameName/i,
    /tagLine/i, /accountId/i, /playerName/i, /internalName/i,
  ],
  enableHeuristicDetection: true,
  maxDepth: 10,
}

export class PiiFieldRegistry {
  private _config: PiiFieldRegistryConfig
  private _canonicalizer: PiiCanonicalizer
  private _customRules: PiiDetectionRule[] = []
  private _customStrategies: ScrubStrategyRule[] = []

  constructor(config?: Partial<PiiFieldRegistryConfig>) {
    this._config = { ...DEFAULT_REGISTRY_CONFIG, ...config }
    if (config?.allowlist) {
      this._config.allowlist = config.allowlist
    }
    if (config?.blocklistPatterns) {
      this._config.blocklistPatterns = config.blocklistPatterns
    }
    this._canonicalizer = new PiiCanonicalizer()
  }

  get canonicalizer(): PiiCanonicalizer {
    return this._canonicalizer
  }

  isAllowed(fieldName: string): boolean {
    return this._config.allowlist.has(fieldName)
  }

  isBlocked(fieldName: string): boolean {
    for (const pattern of this._config.blocklistPatterns) {
      if (pattern.test(fieldName)) return true
    }
    return false
  }

  detectPii(fieldName: string, value: unknown): PiiDetectionRule | null {
    if (this.isAllowed(fieldName)) return null
    const allRules = [...this._config.detectionRules, ...this._customRules]
    return matchRule(fieldName, value, allRules)
  }

  detectAllPii(fieldName: string, value: unknown): PiiDetectionRule[] {
    if (this.isAllowed(fieldName)) return []
    const allRules = [...this._config.detectionRules, ...this._customRules]
    return matchAllRules(fieldName, value, allRules)
  }

  getStrategy(category: PiiFieldCategory): ScrubStrategyRule | null {
    const allStrategies = [...this._config.scrubStrategies, ...this._customStrategies]
    return getStrategyForCategory(category, allStrategies)
  }

  scrubField(
    fieldName: string,
    value: string,
    category: PiiFieldCategory,
  ): { result: string; action: ScrubAction } {
    const strategy = this.getStrategy(category)
    if (!strategy) {
      return { result: "[REDACTED]", action: "redact" }
    }
    const { result } = applyScrubAction(
      value,
      strategy,
      (input, salt) => this._canonicalizer.canonicalizeHash(input, salt),
    )
    return { result, action: strategy.action }
  }

  addRule(rule: PiiDetectionRule): void {
    this._customRules.push(rule)
  }

  addStrategy(strategy: ScrubStrategyRule): void {
    this._customStrategies.push(strategy)
  }

  addToAllowlist(fieldName: string): void {
    this._config.allowlist.add(fieldName)
  }

  removeFromAllowlist(fieldName: string): void {
    this._config.allowlist.delete(fieldName)
  }

  get allowlistSize(): number {
    return this._config.allowlist.size
  }

  get ruleCount(): number {
    return this._config.detectionRules.length + this._customRules.length
  }

  get strategyCount(): number {
    return this._config.scrubStrategies.length + this._customStrategies.length
  }

  clear(): void {
    this._customRules = []
    this._customStrategies = []
    this._canonicalizer.clear()
  }

  dispose(): void {
    this.clear()
  }
}

export function createPiiFieldRegistry(
  config?: Partial<PiiFieldRegistryConfig>,
): PiiFieldRegistry {
  return new PiiFieldRegistry(config)
}
