import type { PiiCacheKey, PiiFieldCategory } from "./PiiCacheKey"
import { piiCacheKeyToString } from "./PiiCacheKey"
import type { ScrubCanonical } from "./ScrubCanonical"

export class PiiCanonicalizer {
  private _cache = new Map<string, ScrubCanonical<PiiCacheKey>>()
  private _hashCache = new Map<string, string>()

  canonicalize(key: PiiCacheKey): ScrubCanonical<PiiCacheKey> {
    const keyStr = piiCacheKeyToString(key)
    const existing = this._cache.get(keyStr)
    if (existing) return existing

    const canonical = { ...key, __scrubbed: true as const } as ScrubCanonical<PiiCacheKey>
    this._cache.set(keyStr, canonical)
    return canonical
  }

  canonicalizeHash(input: string, salt: string): string {
    const cacheKey = `${salt}:${input}`
    const existing = this._hashCache.get(cacheKey)
    if (existing) return existing

    let h0 = 0x6a09e667
    let h1 = 0xbb67ae85
    let h2 = 0x3c6ef372
    let h3 = 0xa54ff53a

    const combined = salt + ":" + input
    for (let i = 0; i < combined.length; i++) {
      const ch = combined.charCodeAt(i)
      h0 = ((h0 ^ ch) * 0x01000193) >>> 0
      h1 = ((h1 ^ (ch << 3)) * 0x01000193) >>> 0
      h2 = ((h2 ^ (ch << 7)) * 0x01000193) >>> 0
      h3 = ((h3 ^ (ch << 11)) * 0x01000193) >>> 0
    }

    const result = h0.toString(16).padStart(8, "0")
      + h1.toString(16).padStart(8, "0")
      + h2.toString(16).padStart(8, "0")
      + h3.toString(16).padStart(8, "0")

    this._hashCache.set(cacheKey, result)
    return result
  }

  get cacheSize(): number {
    return this._cache.size
  }

  get hashCacheSize(): number {
    return this._hashCache.size
  }

  clear(): void {
    this._cache.clear()
    this._hashCache.clear()
  }
}
