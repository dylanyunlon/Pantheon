import type { PiiCacheKey } from "./PiiCacheKey"
import { piiCacheKeyToString } from "./PiiCacheKey"

export class ScrubRefCounts {
  private _counts = new Map<string, number>()
  private _scrubTimestamps = new Map<string, number>()

  retain(key: PiiCacheKey): number {
    const keyStr = piiCacheKeyToString(key)
    const next = (this._counts.get(keyStr) || 0) + 1
    this._counts.set(keyStr, next)
    this._scrubTimestamps.set(keyStr, Date.now())
    return next
  }

  release(key: PiiCacheKey): number {
    const keyStr = piiCacheKeyToString(key)
    const current = this._counts.get(keyStr) || 0
    if (current <= 1) {
      this._counts.delete(keyStr)
      this._scrubTimestamps.delete(keyStr)
      return 0
    }
    const next = current - 1
    this._counts.set(keyStr, next)
    return next
  }

  getCount(key: PiiCacheKey): number {
    return this._counts.get(piiCacheKeyToString(key)) || 0
  }

  getLastScrubTime(key: PiiCacheKey): number | undefined {
    return this._scrubTimestamps.get(piiCacheKeyToString(key))
  }

  get size(): number {
    return this._counts.size
  }

  get totalScrubs(): number {
    let total = 0
    for (const count of this._counts.values()) {
      total += count
    }
    return total
  }

  clear(): void {
    this._counts.clear()
    this._scrubTimestamps.clear()
  }

  getTopScrubbed(limit: number): Array<{ key: string; count: number }> {
    const entries = Array.from(this._counts.entries())
    entries.sort((a, b) => b[1] - a[1])
    return entries.slice(0, limit).map(([key, count]) => ({ key, count }))
  }
}
