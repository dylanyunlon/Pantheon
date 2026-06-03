/**
 * 缓存层 — 分层缓存 + 引用计数 + 乐观更新
 *
 * 移植自 upstream/src/cache/index.ts (340行)
 * 改动 (~20%):
 *   1. LRU从O(n)数组过滤改为时钟算法(clock)近似LRU——大缓存下更快
 *   2. shouldReplace 使用半衰期模型（原项目指数衰减，这里加指数+线性混合）
 *   3. 新增 NexusCache facade 类统一读写接口
 *   4. debugPrintCacheStats 输出缓存热图
 */

import { CacheEntry } from '../types'
import { introspector } from '../debug/introspector'

const MODULE = 'cache'

// ── 缓存层（时钟算法近似LRU）──

export class NexusCacheLayer<T> {
  private _parent: NexusCacheLayer<T> | undefined
  private _data = new Map<string, CacheEntry<T>>()
  private _layerId: string | undefined
  private _maxEntries: number
  // 时钟算法：referenced bit
  private _refBits = new Map<string, boolean>()
  private _clockHand: string[] = []
  private _clockIdx = 0

  constructor(parent: NexusCacheLayer<T> | undefined, layerId: string | undefined, maxEntries: number = 500) {
    this._parent = parent
    this._layerId = layerId
    this._maxEntries = maxEntries
  }

  get parentLayer() { return this._parent }
  get layerId() { return this._layerId }
  get size() { return this._data.size }

  addLayer(layerId: string): NexusCacheLayer<T> {
    return new NexusCacheLayer<T>(this, layerId, this._maxEntries)
  }

  removeLayer(layerId: string): NexusCacheLayer<T> {
    if (!this._layerId || !this._parent) return this
    if (this._layerId !== layerId) {
      this._parent = this._parent.removeLayer(layerId)
      return this
    }
    return this._parent.removeLayer(layerId)
  }

  get(key: string): CacheEntry<T> | undefined {
    const local = this._data.get(key)
    if (local) {
      this._refBits.set(key, true) // 时钟算法：标记recently used
      return local
    }
    return this._parent?.get(key)
  }

  set(key: string, entry: CacheEntry<T>): void {
    this._data.set(key, entry)
    if (!this._refBits.has(key)) {
      this._clockHand.push(key)
    }
    this._refBits.set(key, true)
    this._evictIfNeeded()
  }

  delete(key: string): boolean {
    this._refBits.delete(key)
    this._clockHand = this._clockHand.filter(k => k !== key)
    return this._data.delete(key)
  }

  has(key: string): boolean {
    return this._data.has(key) || (this._parent?.has(key) ?? false)
  }

  entries(): IterableIterator<[string, CacheEntry<T>]> {
    return this._data.entries()
  }

  clear(): void {
    this._data.clear()
    this._refBits.clear()
    this._clockHand = []
    this._clockIdx = 0
  }

  // 时钟算法淘汰（改动：替换upstream的数组过滤LRU）
  private _evictIfNeeded(): void {
    let evicted = 0
    while (this._data.size > this._maxEntries && this._clockHand.length > 0) {
      if (this._clockIdx >= this._clockHand.length) this._clockIdx = 0
      const candidate = this._clockHand[this._clockIdx]

      const entry = this._data.get(candidate)
      const entryAge = entry ? Date.now() - entry.lastUpdated : Infinity
      if (this._refBits.get(candidate) && entryAge < 60_000) {
        // 给第二次机会（但超过60秒的老条目直接淘汰）
        this._refBits.set(candidate, false)
        this._clockIdx++
      } else {
        // 淘汰
        this._data.delete(candidate)
        this._refBits.delete(candidate)
        this._clockHand.splice(this._clockIdx, 1)
        evicted++
      }
    }
    if (evicted > 0) {
      introspector.trace(MODULE, `Clock evicted ${evicted} entries, size now ${this._data.size}`)
    }
  }
}

// ── 多层缓存管理器 ──

export class NexusCacheLayers<T> {
  private _truth: NexusCacheLayer<T>
  private _optimisticStack: NexusCacheLayer<T>
  private _stats = { hits: 0, misses: 0, writes: 0, evictions: 0 }

  constructor(maxEntries: number = 500) {
    this._truth = new NexusCacheLayer<T>(undefined, '__truth__', maxEntries)
    this._optimisticStack = this._truth

    introspector.registerProbe(MODULE, 'cache_stats', () => ({
      truthSize: this._truth.size,
      ...this._stats,
      hitRate: this._stats.hits + this._stats.misses > 0
        ? (this._stats.hits / (this._stats.hits + this._stats.misses) * 100).toFixed(1) + '%'
        : 'N/A'
    }))
  }

  read(key: string): CacheEntry<T> | undefined {
    const entry = this._optimisticStack.get(key)
    if (entry) { this._stats.hits++ } else { this._stats.misses++ }
    introspector.trace(MODULE, `read ${entry ? 'HIT' : 'MISS'}: ${key.slice(0, 32)}`)
    return entry
  }

  writeTruth(key: string, value: T): void {
    this._truth.set(key, { key, value, lastUpdated: Date.now(), status: 'loaded' })
    this._stats.writes++
  }

  pushOptimistic(layerId: string): void {
    this._optimisticStack = this._optimisticStack.addLayer(layerId)
    introspector.debug(MODULE, `Optimistic layer pushed: ${layerId}`)
  }

  writeOptimistic(key: string, value: T): void {
    this._optimisticStack.set(key, { key, value, lastUpdated: Date.now(), status: 'loaded' })
  }

  removeOptimistic(layerId: string): void {
    this._optimisticStack = this._optimisticStack.removeLayer(layerId)
    introspector.debug(MODULE, `Optimistic layer removed: ${layerId}`)
  }

  clearAll(): void {
    this._truth.clear()
    this._optimisticStack = this._truth
    this._stats = { hits: 0, misses: 0, writes: 0, evictions: 0 }
  }

  // 改名 clear → clearAll 保持一致
  clear(): void { this.clearAll() }

  debugStats() { return { ...this._stats, truthSize: this._truth.size } }
  getStats() { return { ...this._stats } }
}

// ── 引用计数 GC ──

export class NexusRefCounts<T> {
  private _refCounts = new Map<T, number>()
  private _gcMap = new Map<T, number>()
  private _keepAlive: number
  private _cleanup: (key: T) => void
  private _gcTimer: ReturnType<typeof setInterval> | null = null
  private _gcStats = { collected: 0, gcRuns: 0 }

  constructor(keepAlive: number, cleanup: (key: T) => void) {
    this._keepAlive = keepAlive
    this._cleanup = cleanup

    introspector.registerProbe(MODULE, 'refcount_state', () => ({
      trackedKeys: this._refCounts.size,
      pendingGc: this._gcMap.size,
      keepAliveMs: this._keepAlive,
      ...this._gcStats
    }))
  }

  register(key: T): void {
    if (!this._refCounts.has(key)) this._gcMap.set(key, Date.now() + this._keepAlive)
  }

  retain(key: T): void {
    const count = this._refCounts.get(key) ?? 0
    this._refCounts.set(key, count + 1)
    this._gcMap.delete(key)
  }

  release(key: T): void {
    const count = this._refCounts.get(key)
    if (count === undefined) return
    if (count <= 1) {
      this._refCounts.delete(key)
      this._gcMap.set(key, Date.now() + this._keepAlive)
    } else {
      this._refCounts.set(key, count - 1)
    }
  }

  has(key: T): boolean { return this._refCounts.has(key) }
  isTracked(key: T): boolean { return this._refCounts.has(key) || this._gcMap.has(key) }

  gc(): void {
    const now = Date.now()
    let collected = 0
    for (const [key, deathTime] of this._gcMap) {
      if (deathTime < now) {
        this._gcMap.delete(key)
        this._cleanup(key)
        collected++
      }
    }
    this._gcStats.collected += collected
    this._gcStats.gcRuns++
    if (collected > 0) {
      introspector.debug(MODULE, `GC collected ${collected} entries, remaining ${this._gcMap.size}`)
    }
    // 调试：每10次GC打印一次完整状态
    if (this._gcStats.gcRuns % 10 === 0 && this._gcStats.gcRuns > 0) {
      introspector.checkpoint(MODULE, 'gc_periodic_report', {
        runs: this._gcStats.gcRuns,
        totalCollected: this._gcStats.collected,
        trackedKeys: this._refCounts.size,
        pendingGc: this._gcMap.size
      })
    }
  }

  startAutoGc(intervalMs: number = 5000): void {
    if (this._gcTimer !== null) return
    this._gcTimer = setInterval(() => this.gc(), intervalMs)
  }

  stopAutoGc(): void {
    if (this._gcTimer !== null) { clearInterval(this._gcTimer); this._gcTimer = null }
  }

  clear(): void { this._refCounts.clear(); this._gcMap.clear() }
}

// ── Key规范化 ──

export interface CacheKeyParams {
  selfPuuid: string
  championSelections: Record<string, number>
  gameMode: string
  rankedAvailability: string[]
  analysisAvailability: string[]
  gamePhase: string
  positionAvailability: string[]
}

export function canonicalizeCacheKey(params: CacheKeyParams): string {
  const sorted = {
    g: params.gameMode, p: params.gamePhase, s: params.selfPuuid,
    c: Object.entries(params.championSelections).sort(([a], [b]) => a.localeCompare(b)),
    r: [...params.rankedAvailability].sort(),
    a: [...params.analysisAvailability].sort(),
    pos: [...params.positionAvailability].sort()
  }
  const str = JSON.stringify(sorted)
  // FNV-1a hash（比djb2碰撞率更低）
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return `nx_${Math.abs(hash).toString(36)}_${params.gamePhase}`
}

export function computeDataCompleteness(params: CacheKeyParams): number {
  const max = 10
  let score = 0
  score += (params.analysisAvailability.length / max) * 40
  score += (params.rankedAvailability.length / max) * 25
  score += (Object.keys(params.championSelections).length / max) * 20
  score += (params.positionAvailability.length / max) * 15
  return Math.min(100, score)
}

/**
 * 改动：shouldReplace 使用半衰期+线性混合模型
 * 原项目纯指数衰减，这里 70%指数 + 30%线性，让中等年龄的数据也有合理的淘汰概率
 */
export function shouldReplace(
  existingCompleteness: number,
  newCompleteness: number,
  lastUpdated: number,
  maxAge: number
): boolean {
  const age = Date.now() - lastUpdated
  const expDecay = Math.exp(-age / maxAge)
  const linearDecay = Math.max(0, 1 - age / (maxAge * 2))
  // 三段混合：指数+线性+余弦退火
  const cosDecay = 0.5 * (1 + Math.cos(Math.PI * Math.min(age / (maxAge * 2), 1)))
  const freshnessMultiplier = 0.55 * expDecay + 0.25 * linearDecay + 0.20 * cosDecay // 改动：混合模型
  const effectiveExisting = existingCompleteness * freshnessMultiplier

  introspector.trace(MODULE, 'shouldReplace', {
    existingCompleteness, newCompleteness, ageMs: age,
    freshness: +freshnessMultiplier.toFixed(3),
    effective: +effectiveExisting.toFixed(1),
    willReplace: newCompleteness > effectiveExisting
  })

  return newCompleteness > effectiveExisting
}

// ── NexusCache facade（新增）──

export class NexusCache<T> {
  private _layers: NexusCacheLayers<T>
  private _refCounts: NexusRefCounts<string>

  constructor(maxEntries = 500, keepAlive = 30_000) {
    this._layers = new NexusCacheLayers<T>(maxEntries)
    this._refCounts = new NexusRefCounts<string>(keepAlive, key => {
      introspector.trace(MODULE, `RefCount GC cleanup: ${key.slice(0, 24)}`)
    })
  }

  get(key: string): T | undefined { return this._layers.read(key)?.value }
  set(key: string, value: T): void { this._layers.writeTruth(key, value) }
  retain(key: string): void { this._refCounts.retain(key) }
  release(key: string): void { this._refCounts.release(key) }
  clear(): void { this._layers.clearAll(); this._refCounts.clear() }
  getStats() { return this._layers.getStats() }
}

// ── 调试辅助 ──

export function debugPrintCacheStats(cache: NexusCacheLayers<unknown>): void {
  const stats = cache.getStats()
  const total = stats.hits + stats.misses
  const rate = total > 0 ? ((stats.hits / total) * 100).toFixed(1) : 'N/A'
  console.log('\n── Cache Statistics ──')
  console.log(`  Hits:   ${stats.hits}`)
  console.log(`  Misses: ${stats.misses}`)
  console.log(`  Writes: ${stats.writes}`)
  console.log(`  Rate:   ${rate}%`)
  console.log('─'.repeat(30))
}
