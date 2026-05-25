import type { ScrubCanonical } from "./ScrubCanonical"

export abstract class ScrubCanonicalizerBase<T> {
  protected _cache = new Map<string, ScrubCanonical<T>>()

  abstract toKey(value: T): string
  abstract fromKey(key: string): T

  canonicalize(value: T): ScrubCanonical<T> {
    const key = this.toKey(value)
    const existing = this._cache.get(key)
    if (existing) return existing

    const canonical = { ...value, __scrubbed: true as const } as ScrubCanonical<T>
    this._cache.set(key, canonical)
    return canonical
  }

  has(value: T): boolean {
    return this._cache.has(this.toKey(value))
  }

  get size(): number {
    return this._cache.size
  }

  clear(): void {
    this._cache.clear()
  }
}
