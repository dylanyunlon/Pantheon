import type { PiiCacheKey, PiiFieldCategory } from "./PiiCacheKey"

export type KnownPiiKey = PiiCacheKey & {
  readonly _brand: "known"
}

export const KNOWN_PII_CATEGORIES: PiiFieldCategory[] = [
  "puuid",
  "summoner_name",
  "account_id",
  "tag_line",
  "display_name",
  "session_key",
  "game_name",
  "internal_name",
  "composite",
]

export const PII_FIELD_PATTERNS: Record<PiiFieldCategory, RegExp[]> = {
  puuid: [/puuid/i, /PUUID/],
  summoner_name: [/summoner/i, /summonerName/i],
  account_id: [/accountId/i, /account_id/i],
  tag_line: [/tagLine/i, /tag_line/i],
  display_name: [/displayName/i, /display_name/i],
  session_key: [/sessionKey/i],
  game_name: [/gameName/i, /game_name/i],
  internal_name: [/internalName/i, /internal_name/i],
  composite: [/playerInfo/i, /userProfile/i],
}

export function detectPiiCategory(fieldName: string): PiiFieldCategory | null {
  for (const [category, patterns] of Object.entries(PII_FIELD_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(fieldName)) return category as PiiFieldCategory
    }
  }
  return null
}

export function isKnownPiiField(fieldName: string): boolean {
  return detectPiiCategory(fieldName) !== null
}
