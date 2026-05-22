import type { PiiCacheKey } from "./PiiCacheKey"
import { piiCacheKeyToString } from "./PiiCacheKey"
import type { ScrubLayerEntry } from "./ScrubLayer"
import type { ScrubLayers } from "./ScrubLayers"

export type ScrubListener = (entry: ScrubLayerEntry) => void

export class ScrubSubjects {
  private _listeners = new Map<string, ScrubListener[]>()
  private _layers: ScrubLayers

  constructor(params: { layers: ScrubLayers }) {
    this._layers = params.layers
  }

  subscribe(key: PiiCacheKey, listener: ScrubListener): () => void {
    const keyStr = piiCacheKeyToString(key)
    if (!this._listeners.has(keyStr)) {
      this._listeners.set(keyStr, [])
    }
    this._listeners.get(keyStr)!.push(listener)

    return () => {
      const listeners = this._listeners.get(keyStr)
      if (listeners) {
        const idx = listeners.indexOf(listener)
        if (idx >= 0) listeners.splice(idx, 1)
        if (listeners.length === 0) this._listeners.delete(keyStr)
      }
    }
  }

  peek(key: PiiCacheKey): ScrubListener | undefined {
    const keyStr = piiCacheKeyToString(key)
    const listeners = this._listeners.get(keyStr)
    if (!listeners || listeners.length === 0) return undefined
    return (entry: ScrubLayerEntry) => {
      for (const listener of listeners) {
        try { listener(entry) } catch (_) {}
      }
    }
  }

  hasSubscribers(key: PiiCacheKey): boolean {
    const keyStr = piiCacheKeyToString(key)
    const listeners = this._listeners.get(keyStr)
    return !!listeners && listeners.length > 0
  }

  get subscriberCount(): number {
    let total = 0
    for (const listeners of this._listeners.values()) {
      total += listeners.length
    }
    return total
  }

  clear(): void {
    this._listeners.clear()
  }
}
