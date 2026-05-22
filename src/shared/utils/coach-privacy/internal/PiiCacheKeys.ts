import type { PiiCacheKey, PiiFieldCategory } from "./PiiCacheKey"
import { createPiiCacheKey, piiCacheKeyToString } from "./PiiCacheKey"
import { DefaultMap } from "./collections/DefaultMap"

export class PiiCacheKeys {
  private _keys: DefaultMap<string, PiiCacheKey>
  private _refCounts = new Map<string, number>()

  constructor() {
    this._keys = new DefaultMap((keyStr: string) => {
      const parts = keyStr.split(":")
      return createPiiCacheKey(parts[2] || "", parts[1] as PiiFieldCategory || "composite", parts[0] || "")
    })
  }

  getOrCreate(fieldPath: string, category: PiiFieldCategory, source: string): PiiCacheKey {
    const keyStr = `${source}:${category}:${fieldPath}`
    return this._keys.get(keyStr)
  }

  retain(key: PiiCacheKey): void {
    const keyStr = piiCacheKeyToString(key)
    this._refCounts.set(keyStr, (this._refCounts.get(keyStr) || 0) + 1)
  }

  release(key: PiiCacheKey): boolean {
    const keyStr = piiCacheKeyToString(key)
    const count = this._refCounts.get(keyStr) || 0
    if (count <= 1) {
      this._refCounts.delete(keyStr)
      return true
    }
    this._refCounts.set(keyStr, count - 1)
    return false
  }

  getRefCount(key: PiiCacheKey): number {
    return this._refCounts.get(piiCacheKeyToString(key)) || 0
  }

  get size(): number {
    return this._refCounts.size
  }

  clear(): void {
    this._refCounts.clear()
  }

  allKeys(): PiiCacheKey[] {
    const keys: PiiCacheKey[] = []
    for (const keyStr of this._refCounts.keys()) {
      keys.push(this._keys.get(keyStr))
    }
    return keys
  }
}
