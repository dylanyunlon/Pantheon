import type { PiiFieldCategory } from "../PiiCacheKey"

export interface PiiDetectionRule {
  id: string
  category: PiiFieldCategory
  fieldPattern: RegExp
  valuePattern?: RegExp
  priority: number
  description: string
}

export const DEFAULT_PII_RULES: PiiDetectionRule[] = [
  {
    id: "rule-puuid-field",
    category: "puuid",
    fieldPattern: /puuid/i,
    valuePattern: /^[a-f0-9-]{30,80}$/i,
    priority: 10,
    description: "Detect PUUID fields by name or value pattern",
  },
  {
    id: "rule-summoner-name",
    category: "summoner_name",
    fieldPattern: /summoner(?:Name|Id)?/i,
    priority: 9,
    description: "Detect summoner name or ID fields",
  },
  {
    id: "rule-account-id",
    category: "account_id",
    fieldPattern: /account(?:Id|_id)/i,
    valuePattern: /^\d{5,20}$/,
    priority: 8,
    description: "Detect account ID fields",
  },
  {
    id: "rule-display-name",
    category: "display_name",
    fieldPattern: /display(?:Name|_name)/i,
    priority: 7,
    description: "Detect display name fields",
  },
  {
    id: "rule-game-name",
    category: "game_name",
    fieldPattern: /game(?:Name|_name)/i,
    priority: 7,
    description: "Detect game name fields",
  },
  {
    id: "rule-tag-line",
    category: "tag_line",
    fieldPattern: /tag(?:Line|_line)/i,
    priority: 6,
    description: "Detect tag line fields",
  },
  {
    id: "rule-internal-name",
    category: "internal_name",
    fieldPattern: /internal(?:Name|_name)/i,
    priority: 5,
    description: "Detect internal name fields",
  },
  {
    id: "rule-player-name",
    category: "display_name",
    fieldPattern: /player(?:Name|_name)/i,
    priority: 6,
    description: "Detect player name fields",
  },
  {
    id: "rule-session-key-composite",
    category: "session_key",
    fieldPattern: /session(?:Key|_key)/i,
    valuePattern: /^[a-f0-9-]+:[A-Z_]+$/,
    priority: 4,
    description: "Detect session keys that embed PUUIDs",
  },
]

export function matchRule(
  fieldName: string,
  value: unknown,
  rules: PiiDetectionRule[],
): PiiDetectionRule | null {
  const sorted = [...rules].sort((a, b) => b.priority - a.priority)
  for (const rule of sorted) {
    if (rule.fieldPattern.test(fieldName)) {
      if (rule.valuePattern && typeof value === "string") {
        if (rule.valuePattern.test(value)) return rule
      }
      if (!rule.valuePattern) return rule
    }
  }
  return null
}

export function matchAllRules(
  fieldName: string,
  value: unknown,
  rules: PiiDetectionRule[],
): PiiDetectionRule[] {
  return rules.filter(rule => {
    if (!rule.fieldPattern.test(fieldName)) return false
    if (rule.valuePattern && typeof value === "string") {
      return rule.valuePattern.test(value)
    }
    return !rule.valuePattern
  })
}
