
export class PantheonRefCounts<T> {
  private _refCounts = new Map<T, number>()
  private _gcMap = new Map<T, number >()
  private _keepAlive: number
  private _cleanup: (key: T) => void
  private _gcTimer: ReturnType<typeof setInterval> | null = null

    constructor(keepAlive: number, cleanup: (key: T) => void) {
    this._keepAlive = keepAlive
    this._cleanup = cleanup
  }

    register(key: T): void {
    if (!this._refCounts.has(key)) {
      this._gcMap.set(key, Date.now() + this._keepAlive)
    }
  }

    retain(key: T): void {
    const count = this._refCounts.get(key) ?? 0
    this._refCounts.set(key, count + 1)
    this._gcMap.delete(key)
  }

    release(key: T): void {
    const count = this._refCounts.get(key)
    if (count === undefined) {
      return
    }
    if (count <= 1) {
      this._refCounts.delete(key)
      this._gcMap.set(key, Date.now() + this._keepAlive)
    } else {
      this._refCounts.set(key, count - 1)
    }
  }

    has(key: T): boolean {
    return this._refCounts.has(key)
  }

    isTracked(key: T): boolean {
    return this._refCounts.has(key) || this._gcMap.has(key)
  }

    gc(): void {
    const now = Date.now()
    for (const [key, deathTime] of this._gcMap) {
      if (deathTime < now) {
        this._gcMap.delete(key)
        this._cleanup(key)
      }
    }
  }

    startAutoGc(intervalMs: number = 5000): void {
    if (this._gcTimer !== null) return
    this._gcTimer = setInterval(() => this.gc(), intervalMs)
  }

    stopAutoGc(): void {
    if (this._gcTimer !== null) {
      clearInterval(this._gcTimer)
      this._gcTimer = null
    }
  }

    clear(): void {
    for (const [key] of this._gcMap) {
      this._cleanup(key)
    }
    this._gcMap.clear()
    this._refCounts.clear()
  }

    get activeCount(): number {
    return this._refCounts.size
  }

  get pendingGcCount(): number {
    return this._gcMap.size
  }
}
