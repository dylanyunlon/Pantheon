/**
 * 缓存层系统 — 分层缓存 + 引用计数 + 乐观更新
 *
 * 来源：原项目 src/shared/utils/cache/ 目录
 * 改动（~20%）：
 *   1. 引入 LRU淘汰（原项目仅靠TTL + refCount GC）
 *   2. 新增缓存命中/未命中统计，通过 introspector 暴露
 *   3. canonicalize函数使用稳定的字段排序+hash（原项目拼接字符串）
 *   4. shouldReplace 的 staleness 判断增加了梯度衰减
 */

import { CacheEntry } from '../types'
import { introspector } from '../debug/introspector'

const MODULE = 'cache'

// ─── 缓存层（含乐观写入栈）───

export class NexusCacheLayer<T> {
  private _parent: NexusCacheLayer<T> | undefined
  private _data = new Map<string, CacheEntry<T>>()
  private _layerId: string | undefined
  private _accessOrder: string[] = []
  private _maxEntries: number

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
      this._touchAccess(key)
      return local
    }
    return this._parent?.get(key)
  }

  set(key: string, entry: CacheEntry<T>): void {
    this._data.set(key, entry)
    this._touchAccess(key)
    this._evictIfNeeded()
  }

  delete(key: string): boolean {
    this._accessOrder = this._accessOrder.filter(k => k !== key)
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
    this._accessOrder = []
  }

  // LRU淘汰（新增）
  private _touchAccess(key: string): void {
    this._accessOrder = this._accessOrder.filter(k => k !== key)
    this._accessOrder.push(key)
  }

  private _evictIfNeeded(): void {
    while (this._data.size > this._maxEntries && this._accessOrder.length > 0) {
      const evictKey = this._accessOrder.shift()!
      this._data.delete(evictKey)
      introspector.trace(MODULE, `LRU evicted: ${evictKey.slice(0, 32)}...`)
    }
  }
}

// ─── 多层缓存管理器 ───

export class NexusCacheLayers<T> {
  private _truth: NexusCacheLayer<T>
  private _optimisticStack: NexusCacheLayer<T>
  private _stats = { hits: 0, misses: 0, writes: 0, evictions: 0 }

  constructor(maxEntries: number = 500) {
    this._truth = new NexusCacheLayer<T>(undefined, '__truth__', maxEntries)
    this._optimisticStack = this._truth

    // 注册调试探针
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
    if (entry) {
      this._stats.hits++
    } else {
      this._stats.misses++
    }
    introspector.trace(MODULE, `read ${entry ? 'HIT' : 'MISS'}: ${key.slice(0, 32)}`)
    return entry
  }

  writeTruth(key: string, value: T): void {
    this._truth.set(key, {
      key,
      value,
      lastUpdated: Date.now(),
      status: 'loaded'
    })
    this._stats.writes++
  }

  pushOptimistic(layerId: string): void {
    this._optimisticStack = this._optimisticStack.addLayer(layerId)
    introspector.debug(MODULE, `Optimistic layer pushed: ${layerId}`)
  }

  writeOptimistic(key: string, value: T): void {
    this._optimisticStack.set(key, {
      key,
      value,
      lastUpdated: Date.now(),
      status: 'loaded'
    })
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

  getStats() { return { ...this._stats } }
}

// ─── 引用计数 GC ───

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
      introspector.debug(MODULE, `GC collected ${collected} entries`, {
        remaining: this._gcMap.size
      })
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
    this._refCounts.clear()
    this._gcMap.clear()
  }
}

// ─── 缓存Key规范化 ───

export interface CacheKeyParams {
  selfPuuid: string
  championSelections: Record<string, number>
  gameMode: string
  rankedAvailability: string[]
  analysisAvailability: string[]
  gamePhase: string
  positionAvailability: string[]
}

/**
 * 改动：使用稳定排序的JSON序列化生成key（原项目用字符串拼接，
 * 在字段顺序不一致时会产生不同key）
 */
export function canonicalizeCacheKey(params: CacheKeyParams): string {
  const sorted = {
    g: params.gameMode,
    p: params.gamePhase,
    s: params.selfPuuid,
    c: Object.entries(params.championSelections).sort(([a], [b]) => a.localeCompare(b)),
    r: [...params.rankedAvailability].sort(),
    a: [...params.analysisAvailability].sort(),
    pos: [...params.positionAvailability].sort()
  }
  // 简单hash——用于缓存key，不需要加密强度
  const str = JSON.stringify(sorted)
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + ch
    hash |= 0
  }
  return `nx_${Math.abs(hash).toString(36)}_${params.gamePhase}`
}

/**
 * 数据完整度评分（改动：加权计算而非简单计数）
 */
export function computeDataCompleteness(params: CacheKeyParams): number {
  let score = 0
  const maxPlayers = 10

  // 分析数据可用性（权重最大）
  score += (params.analysisAvailability.length / maxPlayers) * 40

  // 排位数据可用性
  score += (params.rankedAvailability.length / maxPlayers) * 25

  // 英雄选择数据
  score += (Object.keys(params.championSelections).length / maxPlayers) * 20

  // 位置分配数据
  score += (params.positionAvailability.length / maxPlayers) * 15

  return Math.min(100, score)
}

/**
 * 改动：shouldReplace 使用梯度衰减判断陈旧度
 * 原项目简单比较 lastUpdated + maxAge < now
 * 这里用指数衰减：越久的数据，越容易被替换，即使completeness只高一点点
 */
export function shouldReplace(
  existingCompleteness: number,
  newCompleteness: number,
  lastUpdated: number,
  maxAge: number
): boolean {
  const age = Date.now() - lastUpdated
  // 衰减因子：age = maxAge时约0.37，age = 2*maxAge时约0.14
  const freshnessMultiplier = Math.exp(-age / maxAge)

  // 有效完整度 = 原始完整度 × 新鲜度
  const effectiveExisting = existingCompleteness * freshnessMultiplier

  introspector.trace(MODULE, 'shouldReplace evaluation', {
    existingCompleteness,
    newCompleteness,
    ageMs: age,
    freshnessMultiplier: freshnessMultiplier.toFixed(3),
    effectiveExisting: effectiveExisting.toFixed(1),
    willReplace: newCompleteness > effectiveExisting
  })

  return newCompleteness > effectiveExisting
}
