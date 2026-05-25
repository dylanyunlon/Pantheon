import type { PiiCacheKey } from "./PiiCacheKey"
import type { ScrubLayerEntry } from "./ScrubLayer"

export function createInitScrubEntry<K extends PiiCacheKey>(
  key: K,
): ScrubLayerEntry<K> {
  return {
    cacheKey: key,
    value: undefined,
    originalValue: undefined,
    status: "pending",
    lastScrubbed: 0,
  }
}
