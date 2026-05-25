export type PiiFieldCategory =
  | "puuid"
  | "summoner_name"
  | "account_id"
  | "tag_line"
  | "display_name"
  | "session_key"
  | "game_name"
  | "internal_name"
  | "composite"

export interface PiiCacheKey {
  readonly fieldPath: string
  readonly category: PiiFieldCategory
  readonly source: string
}

export function createPiiCacheKey(
  fieldPath: string,
  category: PiiFieldCategory,
  source: string,
): PiiCacheKey {
  return { fieldPath, category, source }
}

export function piiCacheKeyToString(key: PiiCacheKey): string {
  return `${key.source}:${key.category}:${key.fieldPath}`
}

export function piiCacheKeyEquals(a: PiiCacheKey, b: PiiCacheKey): boolean {
  return a.fieldPath === b.fieldPath
    && a.category === b.category
    && a.source === b.source
}

export const PII_FIELD_INDICES = {
  FIELD_PATH: 0,
  CATEGORY: 1,
  SOURCE: 2,
} as const
