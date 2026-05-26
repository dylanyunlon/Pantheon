/*
 * Copyright 2025 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon Pantheon architecture patterns.
 *
 *     M53: Ingestion pipeline — OPGG + Fandom meta to ontology writes
 *
 *     From ExtraAssetsMain._updateFandomBalance as the good example.
 *     Then, following that pattern, implement ChampionMetaCache to let
 *     the ingestor serve repeated champion lookups from a TTL-bounded
 *     in-memory cache, and enabling sub-millisecond meta resolution
 *     during champion select without redundant HTTP calls. Next,
 *     OpggNormalizer introduces structured extraction from the
 *     polymorphic OpggNormalModeChampion response, making the ingestor
 *     able to produce typed ChampionMeta objects with winRate, pickRate,
 *     banRate, metaTier, counterMatchups, optimalRunes, and coreItems,
 *     while ChampionMetaCache optimizes invalidation with per-champion
 *     TTL tracking for O(1) staleness checks. Subsequently,
 *     FandomBalanceMerger integrates the Fandom BalanceType data,
 *     letting non-SR modes (ARAM, URF, Arena) receive mode-specific
 *     damage multipliers alongside OPGG stats, and ArenaMetaNormalizer
 *     enables structured extraction from the OpggArenaModeChampion
 *     response without duplicating the ranked normalizer logic.
 *     Finally, MetaIngestor orchestrates all four subsystems, ensuring
 *     draft event listeners trigger per-champion fetches that populate
 *     the cache and notify downstream consumers, comprehensively
 *     upgrading meta data access from scattered ad-hoc API calls to
 *     a unified cached ontology-writable pipeline.
 */

import type {
  OpggNormalModeChampion,
  OpggArenaModeChampion,
  OpggARAMBalance,
  RegionType,
  ModeType,
  TierType,
  PositionType
} from '../../../shared/data-sources/opgg/types'
import type { BalanceType } from '../../../shared/data-sources/fandom'

export interface ChampionMeta {
  championId: number
  region: string
  mode: string
  tier: string
  position: string
  winRate: number
  pickRate: number
  banRate: number
  metaTier: number
  metaRank: number
  kda: number
  counterMatchups: CounterMatchup[]
  optimalRunes: RunePageMeta[]
  coreItems: ItemBuildMeta[]
  bootOptions: ItemBuildMeta[]
  starterItems: ItemBuildMeta[]
  skillOrder: SkillOrderMeta[]
  fetchedAt: number
  source: 'opgg-ranked' | 'opgg-aram' | 'opgg-arena'
}

export interface CounterMatchup {
  championId: number
  games: number
  wins: number
  winRate: number
}

export interface RunePageMeta {
  primaryPageId: number
  secondaryPageId: number
  primaryRuneIds: number[]
  secondaryRuneIds: number[]
  statModIds: number[]
  games: number
  wins: number
  winRate: number
  pickRate: number
}

export interface ItemBuildMeta {
  itemIds: number[]
  games: number
  wins: number
  winRate: number
  pickRate: number
}

export interface SkillOrderMeta {
  order: string[]
  games: number
  wins: number
  winRate: number
  pickRate: number
}

export interface BalanceModifiers {
  damageDealt: number
  damageTaken: number
  healing: number
  shielding: number
  abilityHaste: number
  attackSpeed: number
  energyRegen: number
  tenacity: number
  movementSpeed: number
}

export interface ChampionMetaWithBalance extends ChampionMeta {
  balance: BalanceModifiers | null
}

export interface MetaIngestorConfig {
  cacheTtlMs: number
  maxCacheSize: number
  fetchTimeoutMs: number
  maxConcurrentFetches: number
  retryCount: number
  retryDelayMs: number
  defaultRegion: RegionType
  defaultTier: TierType
  balanceCacheTtlMs: number
}

export interface MetaIngestorStats {
  cacheHits: number
  cacheMisses: number
  cacheSize: number
  totalFetches: number
  totalErrors: number
  activeFetches: number
  balanceDataLoaded: boolean
  lastFetchTimestamp: number
  avgFetchDurationMs: number
}

export interface CacheEntry<T> {
  value: T
  fetchedAt: number
  expiresAt: number
  accessCount: number
}

const DEFAULT_CONFIG: MetaIngestorConfig = {
  cacheTtlMs: 3_600_000,
  maxCacheSize: 300,
  fetchTimeoutMs: 10_000,
  maxConcurrentFetches: 5,
  retryCount: 2,
  retryDelayMs: 1000,
  defaultRegion: 'global',
  defaultTier: 'emerald_plus',
  balanceCacheTtlMs: 7_200_000
}

const DEFAULT_BALANCE: BalanceModifiers = {
  damageDealt: 1.0,
  damageTaken: 1.0,
  healing: 1.0,
  shielding: 1.0,
  abilityHaste: 0,
  attackSpeed: 1.0,
  energyRegen: 1.0,
  tenacity: 1.0,
  movementSpeed: 1.0
}

function buildCacheKey(
  championId: number,
  region: string,
  mode: string,
  tier: string,
  position: string
): string {
  return `${championId}:${region}:${mode}:${tier}:${position}`
}

function gameModeToOpggMode(gameMode: string): ModeType {
  switch (gameMode.toUpperCase()) {
    case 'ARAM':
      return 'aram'
    case 'CHERRY':
      return 'arena'
    case 'NEXUSBLITZ':
      return 'nexus_blitz'
    case 'URF':
      return 'urf'
    default:
      return 'ranked'
  }
}

function gameModeToFandomKey(gameMode: string): string {
  switch (gameMode.toUpperCase()) {
    case 'ARAM':
      return 'aram'
    case 'CHERRY':
      return 'ar'
    case 'NEXUSBLITZ':
      return 'nb'
    case 'URF':
      return 'urf'
    case 'ONEFORALL':
      return 'ofa'
    default:
      return ''
  }
}

export type ChampionMetaListener = (meta: ChampionMetaWithBalance) => void

export class ChampionMetaCache {
  private _entries: Map<string, CacheEntry<ChampionMeta>> = new Map()
  private _maxSize: number
  private _defaultTtl: number
  private _hits: number = 0
  private _misses: number = 0

  constructor(maxSize: number, defaultTtl: number) {
    this._maxSize = maxSize
    this._defaultTtl = defaultTtl
  }

  get(key: string): ChampionMeta | null {
    const entry = this._entries.get(key)
    if (!entry) {
      this._misses++
      return null
    }
    if (Date.now() > entry.expiresAt) {
      this._entries.delete(key)
      this._misses++
      return null
    }
    entry.accessCount++
    this._hits++
    return entry.value
  }

  set(key: string, value: ChampionMeta, ttlMs?: number): void {
    if (this._entries.size >= this._maxSize) {
      this._evictLeastAccessed()
    }
    const now = Date.now()
    this._entries.set(key, {
      value,
      fetchedAt: now,
      expiresAt: now + (ttlMs ?? this._defaultTtl),
      accessCount: 0
    })
  }

  has(key: string): boolean {
    const entry = this._entries.get(key)
    if (!entry) return false
    if (Date.now() > entry.expiresAt) {
      this._entries.delete(key)
      return false
    }
    return true
  }

  invalidate(key: string): boolean {
    return this._entries.delete(key)
  }

  invalidateByChampion(championId: number): number {
    let count = 0
    for (const [key] of this._entries) {
      if (key.startsWith(`${championId}:`)) {
        this._entries.delete(key)
        count++
      }
    }
    return count
  }

  clear(): void {
    this._entries.clear()
    this._hits = 0
    this._misses = 0
  }

  get size(): number {
    return this._entries.size
  }

  get stats(): { hits: number; misses: number; ratio: number; size: number } {
    const total = this._hits + this._misses
    return {
      hits: this._hits,
      misses: this._misses,
      ratio: total > 0 ? this._hits / total : 0,
      size: this._entries.size
    }
  }

  private _evictLeastAccessed(): void {
    let minKey: string | null = null
    let minAccess = Infinity
    for (const [key, entry] of this._entries) {
      if (entry.accessCount < minAccess) {
        minAccess = entry.accessCount
        minKey = key
      }
    }
    if (minKey) {
      this._entries.delete(minKey)
    }
  }
}

export class OpggNormalizer {
  normalizeRanked(
    championId: number,
    raw: OpggNormalModeChampion,
    region: string,
    tier: string,
    position: string
  ): ChampionMeta {
    const summary = raw.data.summary
    const avgStats = summary.average_stats

    const counterMatchups: CounterMatchup[] = []
    if (raw.data.counters && Array.isArray(raw.data.counters)) {
      for (const c of raw.data.counters) {
        if (c && typeof c.champion_id === 'number') {
          counterMatchups.push({
            championId: c.champion_id,
            games: c.play || 0,
            wins: c.win || 0,
            winRate: c.play > 0 ? c.win / c.play : 0
          })
        }
      }
    }

    const optimalRunes: RunePageMeta[] = []
    if (raw.data.rune_pages && Array.isArray(raw.data.rune_pages)) {
      for (const rp of raw.data.rune_pages) {
        if (rp.builds && rp.builds.length > 0) {
          const best = rp.builds[0]
          optimalRunes.push({
            primaryPageId: best.primary_page_id,
            secondaryPageId: best.secondary_page_id,
            primaryRuneIds: best.primary_rune_ids.slice(),
            secondaryRuneIds: best.secondary_rune_ids.slice(),
            statModIds: best.stat_mod_ids.slice(),
            games: best.play,
            wins: best.win,
            winRate: best.play > 0 ? best.win / best.play : 0,
            pickRate: best.pick_rate
          })
        }
      }
    }

    const coreItems: ItemBuildMeta[] = this._normalizeItemBuilds(raw.data.core_items)
    const bootOptions: ItemBuildMeta[] = this._normalizeItemBuilds(raw.data.boots)
    const starterItems: ItemBuildMeta[] = this._normalizeItemBuilds(raw.data.starter_items)

    const skillOrder: SkillOrderMeta[] = []
    if (raw.data.skill_masteries && Array.isArray(raw.data.skill_masteries)) {
      for (const sm of raw.data.skill_masteries) {
        skillOrder.push({
          order: sm.ids.slice(),
          games: sm.play,
          wins: sm.win,
          winRate: sm.play > 0 ? sm.win / sm.play : 0,
          pickRate: sm.pick_rate
        })
      }
    }

    return {
      championId,
      region,
      mode: 'ranked',
      tier,
      position,
      winRate: avgStats.win_rate,
      pickRate: avgStats.pick_rate,
      banRate: avgStats.ban_rate ?? 0,
      metaTier: avgStats.tier,
      metaRank: avgStats.rank,
      kda: avgStats.kda,
      counterMatchups,
      optimalRunes,
      coreItems,
      bootOptions,
      starterItems,
      skillOrder,
      fetchedAt: Date.now(),
      source: 'opgg-ranked'
    }
  }

  normalizeAram(
    championId: number,
    raw: OpggNormalModeChampion,
    region: string,
    tier: string
  ): ChampionMeta {
    const base = this.normalizeRanked(championId, raw, region, tier, 'none')
    base.mode = 'aram'
    base.position = 'none'
    base.source = 'opgg-aram'
    return base
  }

  normalizeArena(
    championId: number,
    raw: OpggArenaModeChampion,
    region: string,
    tier: string
  ): ChampionMeta {
    const summary = raw.data.summary
    const avgStats = summary.average_stats

    const coreItems: ItemBuildMeta[] = []
    if (raw.data.core_items && Array.isArray(raw.data.core_items)) {
      for (const ci of raw.data.core_items) {
        coreItems.push({
          itemIds: ci.ids.slice(),
          games: ci.play,
          wins: ci.win,
          winRate: ci.play > 0 ? ci.win / ci.play : 0,
          pickRate: ci.pick_rate
        })
      }
    }

    const bootOptions: ItemBuildMeta[] = []
    if (raw.data.boots && Array.isArray(raw.data.boots)) {
      for (const b of raw.data.boots) {
        bootOptions.push({
          itemIds: b.ids.slice(),
          games: b.play,
          wins: b.win,
          winRate: b.play > 0 ? b.win / b.play : 0,
          pickRate: b.pick_rate
        })
      }
    }

    const skillOrder: SkillOrderMeta[] = []
    if (raw.data.skill_masteries && Array.isArray(raw.data.skill_masteries)) {
      for (const sm of raw.data.skill_masteries) {
        skillOrder.push({
          order: sm.ids.slice(),
          games: sm.play,
          wins: sm.win,
          winRate: sm.play > 0 ? sm.win / sm.play : 0,
          pickRate: sm.pick_rate
        })
      }
    }

    return {
      championId,
      region,
      mode: 'arena',
      tier,
      position: 'none',
      winRate: avgStats.play > 0 ? avgStats.win / avgStats.play : 0,
      pickRate: avgStats.pick_rate,
      banRate: avgStats.ban_rate ?? 0,
      metaTier: avgStats.tier,
      metaRank: avgStats.rank,
      kda: (avgStats.kills + avgStats.assists) / Math.max(avgStats.deaths, 1),
      counterMatchups: [],
      optimalRunes: [],
      coreItems,
      bootOptions,
      starterItems: [],
      skillOrder,
      fetchedAt: Date.now(),
      source: 'opgg-arena'
    }
  }

  private _normalizeItemBuilds(
    raw: { ids: number[]; play: number; win: number; pick_rate: number }[] | undefined
  ): ItemBuildMeta[] {
    if (!raw || !Array.isArray(raw)) return []
    const result: ItemBuildMeta[] = []
    for (const item of raw) {
      result.push({
        itemIds: item.ids.slice(),
        games: item.play,
        wins: item.win,
        winRate: item.play > 0 ? item.win / item.play : 0,
        pickRate: item.pick_rate
      })
    }
    return result
  }
}

export class FandomBalanceMerger {
  private _balanceData: Record<string, BalanceType> | null = null
  private _aramBalance: OpggARAMBalance | null = null
  private _loadedAt: number = 0

  setFandomBalance(data: Record<string, BalanceType>): void {
    this._balanceData = data
    this._loadedAt = Date.now()
  }

  setAramBalance(data: OpggARAMBalance): void {
    this._aramBalance = data
  }

  get isLoaded(): boolean {
    return this._balanceData !== null
  }

  get loadedAt(): number {
    return this._loadedAt
  }

  getBalanceModifiers(championId: number, gameMode: string): BalanceModifiers | null {
    const fandomKey = gameModeToFandomKey(gameMode)
    if (!fandomKey) return null

    if (this._balanceData) {
      const entry = this._balanceData[String(championId)]
      if (entry && entry.balance && entry.balance[fandomKey]) {
        const raw = entry.balance[fandomKey]
        return {
          damageDealt: raw.dmg_dealt ?? 1.0,
          damageTaken: raw.dmg_taken ?? 1.0,
          healing: raw.healing ?? 1.0,
          shielding: raw.shielding ?? 1.0,
          abilityHaste: raw.ability_haste ?? 0,
          attackSpeed: raw.attack_speed ?? 1.0,
          energyRegen: raw.energy_regen ?? 1.0,
          tenacity: raw.tenacity ?? 1.0,
          movementSpeed: raw.movement_speed ?? 1.0
        }
      }
    }

    if (this._aramBalance && fandomKey === 'aram') {
      const aramEntry = this._aramBalance.data.find((d) => d.champion_id === championId)
      if (aramEntry && !aramEntry.default) {
        return {
          damageDealt: aramEntry.damage_dealt ?? 1.0,
          damageTaken: aramEntry.damage_taken ?? 1.0,
          healing: aramEntry.healing ?? 1.0,
          shielding: aramEntry.shield_amount ?? 1.0,
          abilityHaste: aramEntry.cooldown_reduction ?? 0,
          attackSpeed: aramEntry.attack_speed ?? 1.0,
          energyRegen: aramEntry.energy_regen ?? 1.0,
          tenacity: aramEntry.tenacity ?? 1.0,
          movementSpeed: 1.0
        }
      }
    }

    return null
  }

  clear(): void {
    this._balanceData = null
    this._aramBalance = null
    this._loadedAt = 0
  }
}

export class MetaIngestor {
  private _config: MetaIngestorConfig
  private _cache: ChampionMetaCache
  private _normalizer: OpggNormalizer
  private _balanceMerger: FandomBalanceMerger
  private _listeners: Set<ChampionMetaListener> = new Set()
  private _activeFetches: number = 0
  private _totalFetches: number = 0
  private _totalErrors: number = 0
  private _fetchDurations: number[] = []
  private _lastFetchTimestamp: number = 0
  private _inflight: Map<string, Promise<ChampionMeta | null>> = new Map()
  private _fetchChampion: (options: {
    id: number
    region: RegionType
    mode: ModeType
    tier: TierType
    position?: PositionType
  }) => Promise<OpggNormalModeChampion | OpggArenaModeChampion>
  private _fetchAramBalance: (() => Promise<OpggARAMBalance>) | null
  private _fetchFandomBalance: (() => Promise<Record<string, BalanceType>>) | null

  constructor(
    fetchers: {
      fetchChampion: (options: {
        id: number
        region: RegionType
        mode: ModeType
        tier: TierType
        position?: PositionType
      }) => Promise<OpggNormalModeChampion | OpggArenaModeChampion>
      fetchAramBalance?: () => Promise<OpggARAMBalance>
      fetchFandomBalance?: () => Promise<Record<string, BalanceType>>
    },
    config?: Partial<MetaIngestorConfig>
  ) {
    this._config = { ...DEFAULT_CONFIG, ...config }
    this._cache = new ChampionMetaCache(this._config.maxCacheSize, this._config.cacheTtlMs)
    this._normalizer = new OpggNormalizer()
    this._balanceMerger = new FandomBalanceMerger()
    this._fetchChampion = fetchers.fetchChampion
    this._fetchAramBalance = fetchers.fetchAramBalance ?? null
    this._fetchFandomBalance = fetchers.fetchFandomBalance ?? null
  }

  get cache(): ChampionMetaCache {
    return this._cache
  }

  get balanceMerger(): FandomBalanceMerger {
    return this._balanceMerger
  }

  onMeta(listener: ChampionMetaListener): () => void {
    this._listeners.add(listener)
    return () => { this._listeners.delete(listener) }
  }

  async loadBalanceData(): Promise<boolean> {
    let loaded = false
    if (this._fetchFandomBalance) {
      try {
        const fandomData = await this._fetchFandomBalance()
        this._balanceMerger.setFandomBalance(fandomData)
        loaded = true
      } catch { /* fandom optional */ }
    }
    if (this._fetchAramBalance) {
      try {
        const aramData = await this._fetchAramBalance()
        this._balanceMerger.setAramBalance(aramData)
        loaded = true
      } catch { /* aram balance optional */ }
    }
    return loaded
  }

  async ingestChampion(params: {
    championId: number
    region?: RegionType
    mode?: ModeType
    tier?: TierType
    position?: PositionType
    gameMode?: string
  }): Promise<ChampionMetaWithBalance | null> {
    const region = params.region ?? this._config.defaultRegion
    const tier = params.tier ?? this._config.defaultTier
    const gameMode = params.gameMode ?? 'CLASSIC'
    const mode = params.mode ?? gameModeToOpggMode(gameMode)
    const position = params.position ?? (mode === 'aram' || mode === 'arena' ? 'none' : 'all')

    const cacheKey = buildCacheKey(params.championId, region, mode, tier, position)

    const cached = this._cache.get(cacheKey)
    if (cached) {
      const balance = this._balanceMerger.getBalanceModifiers(params.championId, gameMode)
      const result: ChampionMetaWithBalance = { ...cached, balance }
      return result
    }

    const existing = this._inflight.get(cacheKey)
    if (existing) {
      const meta = await existing
      if (!meta) return null
      const balance = this._balanceMerger.getBalanceModifiers(params.championId, gameMode)
      return { ...meta, balance }
    }

    const fetchPromise = this._doFetch(params.championId, region, mode, tier, position as PositionType)
    this._inflight.set(cacheKey, fetchPromise)

    try {
      const meta = await fetchPromise
      if (!meta) return null
      this._cache.set(cacheKey, meta)
      const balance = this._balanceMerger.getBalanceModifiers(params.championId, gameMode)
      const result: ChampionMetaWithBalance = { ...meta, balance }
      this._notifyListeners(result)
      return result
    } finally {
      this._inflight.delete(cacheKey)
    }
  }

  async ingestDraft(params: {
    championIds: number[]
    region?: RegionType
    tier?: TierType
    gameMode?: string
    positions?: Record<number, PositionType>
  }): Promise<Map<number, ChampionMetaWithBalance>> {
    const results = new Map<number, ChampionMetaWithBalance>()
    const pending: Promise<void>[] = []

    for (const championId of params.championIds) {
      if (championId <= 0) continue

      const position = params.positions?.[championId]
      const promise = this.ingestChampion({
        championId,
        region: params.region,
        tier: params.tier,
        gameMode: params.gameMode,
        position
      }).then((meta) => {
        if (meta) {
          results.set(championId, meta)
        }
      })
      pending.push(promise)
    }

    await Promise.allSettled(pending)
    return results
  }

  getStats(): MetaIngestorStats {
    const cacheStats = this._cache.stats
    const avgDuration = this._fetchDurations.length > 0
      ? this._fetchDurations.reduce((a, b) => a + b, 0) / this._fetchDurations.length
      : 0

    return {
      cacheHits: cacheStats.hits,
      cacheMisses: cacheStats.misses,
      cacheSize: cacheStats.size,
      totalFetches: this._totalFetches,
      totalErrors: this._totalErrors,
      activeFetches: this._activeFetches,
      balanceDataLoaded: this._balanceMerger.isLoaded,
      lastFetchTimestamp: this._lastFetchTimestamp,
      avgFetchDurationMs: Math.round(avgDuration * 100) / 100
    }
  }

  getCachedMeta(
    championId: number,
    region?: string,
    mode?: string,
    tier?: string,
    position?: string
  ): ChampionMeta | null {
    const key = buildCacheKey(
      championId,
      region ?? this._config.defaultRegion,
      mode ?? 'ranked',
      tier ?? this._config.defaultTier,
      position ?? 'all'
    )
    return this._cache.get(key)
  }

  invalidateChampion(championId: number): number {
    return this._cache.invalidateByChampion(championId)
  }

  clear(): void {
    this._cache.clear()
    this._balanceMerger.clear()
    this._inflight.clear()
    this._fetchDurations = []
    this._totalFetches = 0
    this._totalErrors = 0
    this._activeFetches = 0
    this._lastFetchTimestamp = 0
  }

  dispose(): void {
    this.clear()
    this._listeners.clear()
  }

  private async _doFetch(
    championId: number,
    region: string,
    mode: ModeType,
    tier: TierType,
    position: PositionType
  ): Promise<ChampionMeta | null> {
    this._activeFetches++
    this._totalFetches++
    this._lastFetchTimestamp = Date.now()
    const start = Date.now()

    let lastError: unknown = null
    for (let attempt = 0; attempt <= this._config.retryCount; attempt++) {
      try {
        const raw = await this._fetchChampion({
          id: championId,
          region: region as RegionType,
          mode,
          tier,
          position: mode === 'aram' ? 'none' as PositionType : position
        })

        this._activeFetches--
        const elapsed = Date.now() - start
        this._fetchDurations.push(elapsed)
        if (this._fetchDurations.length > 100) {
          this._fetchDurations = this._fetchDurations.slice(-50)
        }

        if (mode === 'arena') {
          return this._normalizer.normalizeArena(
            championId,
            raw as OpggArenaModeChampion,
            region,
            tier
          )
        }
        if (mode === 'aram') {
          return this._normalizer.normalizeAram(
            championId,
            raw as OpggNormalModeChampion,
            region,
            tier
          )
        }
        return this._normalizer.normalizeRanked(
          championId,
          raw as OpggNormalModeChampion,
          region,
          tier,
          position
        )
      } catch (err) {
        lastError = err
        if (attempt < this._config.retryCount) {
          await this._delay(this._config.retryDelayMs * (attempt + 1))
        }
      }
    }

    this._activeFetches--
    this._totalErrors++
    return null
  }

  private _notifyListeners(meta: ChampionMetaWithBalance): void {
    for (const listener of this._listeners) {
      try { listener(meta) } catch { /* swallow */ }
    }
  }

  private _delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

export function createMetaIngestor(
  fetchers: {
    fetchChampion: (options: {
      id: number
      region: RegionType
      mode: ModeType
      tier: TierType
      position?: PositionType
    }) => Promise<OpggNormalModeChampion | OpggArenaModeChampion>
    fetchAramBalance?: () => Promise<OpggARAMBalance>
    fetchFandomBalance?: () => Promise<Record<string, BalanceType>>
  },
  config?: Partial<MetaIngestorConfig>
): MetaIngestor {
  return new MetaIngestor(fetchers, config)
}
