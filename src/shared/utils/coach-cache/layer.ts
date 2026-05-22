
export interface CacheEntry<T> {
  readonly key: string
  value: T
  lastUpdated: number
  status: 'init' | 'loading' | 'loaded' | 'error'
}

export class CoachCacheLayer<T> {
  private _parent: CoachCacheLayer<T> | undefined
  private _cache = new Map<string, CacheEntry<T>>()
  private _layerId: string | undefined

  constructor(parent: CoachCacheLayer<T> | undefined, layerId: string | undefined) {
    this._parent = parent
    this._layerId = layerId
  }

  get parentLayer(): CoachCacheLayer<T> | undefined {
    return this._parent
  }

  get layerId(): string | undefined {
    return this._layerId
  }

    addLayer(layerId: string): CoachCacheLayer<T> {
    return new CoachCacheLayer<T>(this, layerId)
  }

    removeLayer(layerId: string): CoachCacheLayer<T> {
    if (this._layerId === undefined || this._parent === undefined) {
      return this
    }
    if (this._layerId !== layerId) {
      this._parent = this._parent.removeLayer(layerId)
      return this
    }
    return this._parent.removeLayer(layerId)
  }

    get(key: string): CacheEntry<T> | undefined {
    return this._cache.get(key) ?? this._parent?.get(key)
  }

  set(key: string, entry: CacheEntry<T>): void {
    this._cache.set(key, entry)
  }

  delete(key: string): boolean {
    return this._cache.delete(key)
  }

  has(key: string): boolean {
    return this._cache.has(key) || (this._parent?.has(key) ?? false)
  }

    entries(): IterableIterator<[string, CacheEntry<T>]> {
    return this._cache.entries()
  }

  keys(): IterableIterator<string> {
    return this._cache.keys()
  }

  get size(): number {
    return this._cache.size
  }

  clear(): void {
    this._cache.clear()
  }
}

export class CoachCacheLayers<T> {
  private _truthLayer: CoachCacheLayer<T>
  private _topLayer: CoachCacheLayer<T>

  constructor() {
    this._truthLayer = new CoachCacheLayer<T>(undefined, undefined)
    this._topLayer = this._truthLayer
  }

  get truth(): CoachCacheLayer<T> {
    return this._truthLayer
  }

  get top(): CoachCacheLayer<T> {
    return this._topLayer
  }

    writeTruth(key: string, value: T): CacheEntry<T> {
    const entry: CacheEntry<T> = {
      key,
      value,
      lastUpdated: Date.now(),
      status: 'loaded'
    }
    this._truthLayer.set(key, entry)
    return entry
  }

    pushOptimistic(layerId: string): string {
    this._topLayer = this._topLayer.addLayer(layerId)
    return layerId
  }

    writeOptimistic(key: string, value: T): CacheEntry<T> {
    const entry: CacheEntry<T> = {
      key,
      value,
      lastUpdated: Date.now(),
      status: 'loaded'
    }
    this._topLayer.set(key, entry)
    return entry
  }

    removeOptimistic(layerId: string): string[] {
    const affectedKeys: string[] = []
    let current: CoachCacheLayer<T> | undefined = this._topLayer
    while (current && current.parentLayer) {
      if (current.layerId === layerId) {
        for (const [k] of current.entries()) {
          affectedKeys.push(k)
        }
      }
      current = current.parentLayer
    }

    this._topLayer = this._topLayer.removeLayer(layerId)
    return affectedKeys
  }

    read(key: string): CacheEntry<T> | undefined {
    return this._topLayer.get(key)
  }

    readTruth(key: string): CacheEntry<T> | undefined {
    return this._truthLayer.get(key)
  }

    isOptimistic(key: string): boolean {
    const topEntry = this._topLayer.get(key)
    const truthEntry = this._truthLayer.get(key)
    return topEntry?.value !== truthEntry?.value
  }

  clearAll(): void {
    this._truthLayer.clear()
    this._topLayer = this._truthLayer
  }
}
