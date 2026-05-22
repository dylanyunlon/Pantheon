import type { PiiCacheKey } from "./PiiCacheKey"
import type { ScrubOperationId } from "./ScrubOperationId"
import type { ScrubStatus } from "./ScrubCanonical"

export interface ScrubLayerEntry<K extends PiiCacheKey = PiiCacheKey> {
  cacheKey: K
  value: unknown
  originalValue: unknown
  status: ScrubStatus
  lastScrubbed: number
  operationId?: ScrubOperationId
}

export class ScrubLayer {
  readonly layerId: ScrubOperationId | undefined
  readonly parentLayer: ScrubLayer | undefined
  private _entries = new Map<string, ScrubLayerEntry>()

  constructor(layerId: ScrubOperationId | undefined, parentLayer: ScrubLayer | undefined) {
    this.layerId = layerId
    this.parentLayer = parentLayer
  }

  get<K extends PiiCacheKey>(key: K): ScrubLayerEntry<K> | undefined {
    const keyStr = `${key.source}:${key.category}:${key.fieldPath}`
    const entry = this._entries.get(keyStr) as ScrubLayerEntry<K> | undefined
    if (entry) return entry
    return this.parentLayer?.get(key)
  }

  set<K extends PiiCacheKey>(key: K, entry: ScrubLayerEntry<K>): void {
    const keyStr = `${key.source}:${key.category}:${key.fieldPath}`
    this._entries.set(keyStr, entry as ScrubLayerEntry)
  }

  has(key: PiiCacheKey): boolean {
    const keyStr = `${key.source}:${key.category}:${key.fieldPath}`
    return this._entries.has(keyStr)
  }

  delete(key: PiiCacheKey): boolean {
    const keyStr = `${key.source}:${key.category}:${key.fieldPath}`
    return this._entries.delete(keyStr)
  }

  entries(): IterableIterator<[string, ScrubLayerEntry]> {
    return this._entries.entries()
  }

  get size(): number {
    return this._entries.size
  }

  addLayer(layerId: ScrubOperationId): ScrubLayer {
    return new ScrubLayer(layerId, this)
  }

  removeLayer(layerId: ScrubOperationId): ScrubLayer {
    if (this.layerId === layerId) {
      return this.parentLayer || new ScrubLayer(undefined, undefined)
    }
    if (this.parentLayer) {
      const newParent = this.parentLayer.removeLayer(layerId)
      if (newParent === this.parentLayer) return this
      const replacement = new ScrubLayer(this.layerId, newParent)
      for (const [k, v] of this._entries) {
        replacement._entries.set(k, v)
      }
      return replacement
    }
    return this
  }

  getAllEntries(): Map<string, ScrubLayerEntry> {
    const result = new Map<string, ScrubLayerEntry>()
    if (this.parentLayer) {
      for (const [k, v] of this.parentLayer.getAllEntries()) {
        result.set(k, v)
      }
    }
    for (const [k, v] of this._entries) {
      result.set(k, v)
    }
    return result
  }
}
