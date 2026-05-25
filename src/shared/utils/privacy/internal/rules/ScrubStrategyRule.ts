import type { PiiFieldCategory } from "../PiiCacheKey"
import type { ScrubStatus } from "../ScrubCanonical"

export type ScrubAction = "hash" | "redact" | "tokenize" | "truncate" | "mask" | "pass"

export interface ScrubStrategyRule {
  id: string
  category: PiiFieldCategory
  action: ScrubAction
  salt?: string
  maskChar?: string
  maskKeepFirst?: number
  maskKeepLast?: number
  truncateLength?: number
  description: string
}

export const DEFAULT_SCRUB_STRATEGIES: ScrubStrategyRule[] = [
  {
    id: "strategy-puuid-hash",
    category: "puuid",
    action: "hash",
    salt: "pantheon-privacy-v1",
    description: "Hash PUUIDs with deterministic salt for cross-reference",
  },
  {
    id: "strategy-summoner-redact",
    category: "summoner_name",
    action: "redact",
    description: "Fully redact summoner names",
  },
  {
    id: "strategy-account-hash",
    category: "account_id",
    action: "hash",
    salt: "pantheon-privacy-v1",
    description: "Hash account IDs",
  },
  {
    id: "strategy-display-redact",
    category: "display_name",
    action: "redact",
    description: "Fully redact display names",
  },
  {
    id: "strategy-game-name-redact",
    category: "game_name",
    action: "redact",
    description: "Fully redact game names",
  },
  {
    id: "strategy-tag-redact",
    category: "tag_line",
    action: "redact",
    description: "Fully redact tag lines",
  },
  {
    id: "strategy-internal-redact",
    category: "internal_name",
    action: "redact",
    description: "Fully redact internal names",
  },
  {
    id: "strategy-session-mask",
    category: "session_key",
    action: "mask",
    maskChar: "*",
    maskKeepFirst: 4,
    maskKeepLast: 4,
    description: "Mask session keys preserving prefix/suffix for debugging",
  },
  {
    id: "strategy-composite-hash",
    category: "composite",
    action: "hash",
    salt: "pantheon-privacy-v1",
    description: "Hash composite PII fields",
  },
]

export function getStrategyForCategory(
  category: PiiFieldCategory,
  strategies: ScrubStrategyRule[] = DEFAULT_SCRUB_STRATEGIES,
): ScrubStrategyRule | null {
  return strategies.find(s => s.category === category) || null
}

export function applyScrubAction(
  value: string,
  strategy: ScrubStrategyRule,
  hashFn: (input: string, salt: string) => string,
): { result: string; status: ScrubStatus } {
  switch (strategy.action) {
    case "hash":
      return {
        result: hashFn(value, strategy.salt || ""),
        status: "scrubbed",
      }
    case "redact":
      return {
        result: "[REDACTED]",
        status: "redacted",
      }
    case "tokenize":
      return {
        result: value,
        status: "tokenized",
      }
    case "truncate": {
      const len = strategy.truncateLength || 8
      return {
        result: value.slice(0, len) + "...",
        status: "scrubbed",
      }
    }
    case "mask": {
      const keepFirst = strategy.maskKeepFirst || 0
      const keepLast = strategy.maskKeepLast || 0
      const maskChar = strategy.maskChar || "*"
      if (value.length <= keepFirst + keepLast) {
        return { result: maskChar.repeat(value.length), status: "scrubbed" }
      }
      const masked = value.slice(0, keepFirst)
        + maskChar.repeat(value.length - keepFirst - keepLast)
        + value.slice(value.length - keepLast)
      return { result: masked, status: "scrubbed" }
    }
    case "pass":
      return { result: value, status: "pass-through" }
  }
}
