import type { PiiCacheKey } from "./PiiCacheKey"
import type { ScrubStatus } from "./ScrubCanonical"

export interface ScrubPayload<K extends PiiCacheKey = PiiCacheKey> {
  cacheKey: K
  value: unknown
  originalValue: unknown
  status: ScrubStatus
  lastScrubbed: number
  isScrubDeferred?: boolean
}

export function createScrubPayload<K extends PiiCacheKey>(
  cacheKey: K,
  value: unknown,
  originalValue: unknown,
  status: ScrubStatus,
): ScrubPayload<K> {
  return {
    cacheKey,
    value,
    originalValue,
    status,
    lastScrubbed: Date.now(),
    isScrubDeferred: false,
  }
}
