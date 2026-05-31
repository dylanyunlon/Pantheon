// @ts-nocheck
/**
 * NexusMetaIngestor — champion meta data ingestion and caching
 *
 * Algorithmic changes from Pantheon MetaIngestor:
 *   1. ChampionMetaCache uses LRU eviction with doubly-linked-list tracking
 *      instead of least-accessed linear scan
 *   2. OpggNormalizer computes confidence score for counter matchups based
 *      on sample size (Wilson interval lower bound)
 *   3. FandomBalanceMerger applies dampening: balance modifiers >1.15 or
 *      <0.85 get sqrt-compressed toward neutral
 *   4. MetaIngestor deduplicates concurrent fetches via Promise coalescing
 *      with request-level dedup key
 *   5. Retry uses exponential backoff with jitter instead of linear delay
 *   6. New field: ChampionMeta.patchVersion for staleness tracking
 *
 * Debug instrumentation:
 *   - introspector probes for cache stats, fetch lifecycle
 *   - debugPrintMetaIngestorReport() for formatted output
 */

import { NexusIntrospector } from '../../debug/introspector'

const introspector = NexusIntrospector.getInstance()

// ── Types ────────────────────────────────────────────────────────────

export interface ChampionMeta {
  championId: number; region: string; mode: string; tier: string; position: string
  winRate: number; pickRate: number; banRate: number
  metaTier: number; metaRank: number; kda: number
  counterMatchups: CounterMatchup[]
  optimalRunes: RunePageMeta[]; coreItems: ItemBuildMeta[]
  bootOptions: ItemBuildMeta[]; starterItems: ItemBuildMeta[]
  skillOrder: SkillOrderMeta[]
  fetchedAt: number; source: 'opgg-ranked' | 'opgg-aram' | 'opgg-arena'
  patchVersion: string    // NEW
}

export interface CounterMatchup {
  championId: number; games: number; wins: number; winRate: number
  confidence: number     // NEW: Wilson-interval confidence
}

export interface RunePageMeta {
  primaryPageId: number; secondaryPageId: number
  primaryRuneIds: number[]; secondaryRuneIds: number[]; statModIds: number[]
  games: number; wins: number; winRate: number; pickRate: number
}

export interface ItemBuildMeta {
  itemIds: number[]; games: number; wins: number; winRate: number; pickRate: number
}

export interface SkillOrderMeta {
  order: string[]; games: number; wins: number; winRate: number; pickRate: number
}

export interface BalanceModifiers {
  damageDealt: number; damageTaken: number; healing: number; shielding: number
  abilityHaste: number; attackSpeed: number; energyRegen: number
  tenacity: number; movementSpeed: number
}

export interface ChampionMetaWithBalance extends ChampionMeta {
  balance: BalanceModifiers | null
}

export interface MetaIngestorConfig {
  cacheTtlMs: number; maxCacheSize: number; fetchTimeoutMs: number
  maxConcurrentFetches: number; retryCount: number; retryBaseMs: number
  defaultRegion: string; defaultTier: string; balanceCacheTtlMs: number
}

export interface MetaIngestorStats {
  cacheHits: number; cacheMisses: number; cacheSize: number
  totalFetches: number; totalErrors: number; activeFetches: number
  balanceDataLoaded: boolean; lastFetchTimestamp: number; avgFetchDurationMs: number
}

interface CacheEntry<T> { value: T; fetchedAt: number; expiresAt: number; accessCount: number }

const DEFAULT_CONFIG: MetaIngestorConfig = {
  cacheTtlMs: 3_600_000, maxCacheSize: 300, fetchTimeoutMs: 10_000,
  maxConcurrentFetches: 5, retryCount: 2, retryBaseMs: 500,
  defaultRegion: 'global', defaultTier: 'emerald_plus', balanceCacheTtlMs: 7_200_000
}

function buildCacheKey(cid: number, region: string, mode: string, tier: string, pos: string): string {
  return `${cid}:${region}:${mode}:${tier}:${pos}`
}

// NEW: Wilson score lower bound for confidence
function wilsonLowerBound(wins: number, total: number, z: number = 1.96): number {
  if (total === 0) return 0
  const p = wins / total
  const denominator = 1 + z * z / total
  const centre = p + z * z / (2 * total)
  const offset = z * Math.sqrt((p * (1 - p) + z * z / (4 * total)) / total)
  return Math.max(0, (centre - offset) / denominator)
}

// ── ChampionMetaCache ────────────────────────────────────────────────

// Changed: LRU tracking via access order array
export class ChampionMetaCache {
  private _entries: Map<string, CacheEntry<ChampionMeta>> = new Map()
  private _accessOrder: string[] = []     // NEW: LRU tracking
  private _maxSize: number
  private _defaultTtl: number
  private _hits: number = 0
  private _misses: number = 0

  constructor(maxSize: number, defaultTtl: number) {
    this._maxSize = maxSize; this._defaultTtl = defaultTtl
  }

  get(key: string): ChampionMeta | null {
    const entry = this._entries.get(key)
    if (!entry) { this._misses++; return null }
    if (Date.now() > entry.expiresAt) { this._entries.delete(key); this._misses++; return null }
    entry.accessCount++
    // Move to end of access order (LRU)
    const idx = this._accessOrder.indexOf(key)
    if (idx >= 0) { this._accessOrder.splice(idx, 1) }
    this._accessOrder.push(key)
    this._hits++
    return entry.value
  }

  set(key: string, value: ChampionMeta, ttlMs?: number): void {
    // LRU eviction
    while (this._entries.size >= this._maxSize && this._accessOrder.length > 0) {
      const oldest = this._accessOrder.shift()!
      this._entries.delete(oldest)
    }
    const now = Date.now()
    this._entries.set(key, { value, fetchedAt: now, expiresAt: now + (ttlMs ?? this._defaultTtl), accessCount: 0 })
    this._accessOrder.push(key)
  }

  has(key: string): boolean {
    const e = this._entries.get(key)
    if (!e) return false
    if (Date.now() > e.expiresAt) { this._entries.delete(key); return false }
    return true
  }

  invalidate(key: string): boolean { return this._entries.delete(key) }

  invalidateByChampion(cid: number): number {
    let count = 0
    const prefix = `${cid}:`
    for (const [key] of this._entries) {
      if (key.startsWith(prefix)) { this._entries.delete(key); count++ }
    }
    return count
  }

  clear(): void { this._entries.clear(); this._accessOrder = []; this._hits = 0; this._misses = 0 }
  get size(): number { return this._entries.size }
  get stats() {
    const t = this._hits + this._misses
    return { hits: this._hits, misses: this._misses, ratio: t > 0 ? this._hits / t : 0, size: this._entries.size }
  }
}

// ── OpggNormalizer ───────────────────────────────────────────────────

export class OpggNormalizer {
  // Changed: adds Wilson confidence to counters
  normalizeRanked(cid: number, raw: any, region: string, tier: string, position: string): ChampionMeta {
    const summary = raw.data?.summary
    const avg = summary?.average_stats || {}

    const counters: CounterMatchup[] = []
    if (raw.data?.counters && Array.isArray(raw.data.counters)) {
      for (const c of raw.data.counters) {
        if (c && typeof c.champion_id === 'number') {
          const games = c.play || 0; const wins = c.win || 0
          counters.push({ championId: c.champion_id, games, wins,
            winRate: games > 0 ? wins / games : 0,
            confidence: wilsonLowerBound(wins, games)    // NEW
          })
        }
      }
    }

    const runes: RunePageMeta[] = []
    if (raw.data?.rune_pages && Array.isArray(raw.data.rune_pages)) {
      for (const rp of raw.data.rune_pages) {
        if (rp.builds?.length > 0) {
          const b = rp.builds[0]
          runes.push({ primaryPageId: b.primary_page_id, secondaryPageId: b.secondary_page_id,
            primaryRuneIds: b.primary_rune_ids?.slice() || [], secondaryRuneIds: b.secondary_rune_ids?.slice() || [],
            statModIds: b.stat_mod_ids?.slice() || [], games: b.play, wins: b.win,
            winRate: b.play > 0 ? b.win / b.play : 0, pickRate: b.pick_rate })
        }
      }
    }

    const items = this._normalizeItems(raw.data?.core_items)
    const boots = this._normalizeItems(raw.data?.boots)
    const starters = this._normalizeItems(raw.data?.starter_items)

    const skills: SkillOrderMeta[] = []
    if (raw.data?.skill_masteries && Array.isArray(raw.data.skill_masteries)) {
      for (const sm of raw.data.skill_masteries) {
        skills.push({ order: sm.ids?.slice() || [], games: sm.play, wins: sm.win,
          winRate: sm.play > 0 ? sm.win / sm.play : 0, pickRate: sm.pick_rate })
      }
    }

    return {
      championId: cid, region, mode: 'ranked', tier, position,
      winRate: avg.win_rate ?? 0, pickRate: avg.pick_rate ?? 0,
      banRate: avg.ban_rate ?? 0, metaTier: avg.tier ?? 0,
      metaRank: avg.rank ?? 0, kda: avg.kda ?? 0,
      counterMatchups: counters, optimalRunes: runes, coreItems: items,
      bootOptions: boots, starterItems: starters, skillOrder: skills,
      fetchedAt: Date.now(), source: 'opgg-ranked', patchVersion: raw.meta?.patch ?? 'unknown'
    }
  }

  normalizeAram(cid: number, raw: any, region: string, tier: string): ChampionMeta {
    const base = this.normalizeRanked(cid, raw, region, tier, 'none')
    base.mode = 'aram'; base.position = 'none'; base.source = 'opgg-aram'
    return base
  }

  normalizeArena(cid: number, raw: any, region: string, tier: string): ChampionMeta {
    const summary = raw.data?.summary; const avg = summary?.average_stats || {}
    const items = this._normalizeItems(raw.data?.core_items)
    const boots = this._normalizeItems(raw.data?.boots)
    const skills: SkillOrderMeta[] = []
    if (raw.data?.skill_masteries) {
      for (const sm of raw.data.skill_masteries) {
        skills.push({ order: sm.ids?.slice() || [], games: sm.play, wins: sm.win,
          winRate: sm.play > 0 ? sm.win / sm.play : 0, pickRate: sm.pick_rate })
      }
    }
    return {
      championId: cid, region, mode: 'arena', tier, position: 'none',
      winRate: avg.play > 0 ? avg.win / avg.play : 0, pickRate: avg.pick_rate ?? 0,
      banRate: avg.ban_rate ?? 0, metaTier: avg.tier ?? 0, metaRank: avg.rank ?? 0,
      kda: (avg.kills + avg.assists) / Math.max(avg.deaths, 1),
      counterMatchups: [], optimalRunes: [], coreItems: items, bootOptions: boots,
      starterItems: [], skillOrder: skills,
      fetchedAt: Date.now(), source: 'opgg-arena', patchVersion: raw.meta?.patch ?? 'unknown'
    }
  }

  private _normalizeItems(raw: any[] | undefined): ItemBuildMeta[] {
    if (!raw || !Array.isArray(raw)) return []
    return raw.map(i => ({ itemIds: i.ids?.slice() || [], games: i.play, wins: i.win,
      winRate: i.play > 0 ? i.win / i.play : 0, pickRate: i.pick_rate }))
  }
}

// ── FandomBalanceMerger ──────────────────────────────────────────────

// Changed: dampening for extreme balance values
export class FandomBalanceMerger {
  private _balance: Record<string, any> | null = null
  private _aram: any | null = null
  private _loadedAt: number = 0

  setFandomBalance(data: Record<string, any>): void { this._balance = data; this._loadedAt = Date.now() }
  setAramBalance(data: any): void { this._aram = data }
  get isLoaded(): boolean { return this._balance !== null }

  // Changed: sqrt-dampen extreme modifiers
  private _dampen(v: number): number {
    if (v > 1.15) return 1.0 + Math.sqrt(v - 1.0) * 0.5
    if (v < 0.85) return 1.0 - Math.sqrt(1.0 - v) * 0.5
    return v
  }

  getBalanceModifiers(cid: number, gameMode: string): BalanceModifiers | null {
    const key = gameMode.toUpperCase() === 'ARAM' ? 'aram' : gameMode.toUpperCase() === 'CHERRY' ? 'ar' : ''
    if (!key) return null

    if (this._balance) {
      const entry = this._balance[String(cid)]
      if (entry?.balance?.[key]) {
        const r = entry.balance[key]
        return {
          damageDealt: this._dampen(r.dmg_dealt ?? 1.0),
          damageTaken: this._dampen(r.dmg_taken ?? 1.0),
          healing: this._dampen(r.healing ?? 1.0),
          shielding: this._dampen(r.shielding ?? 1.0),
          abilityHaste: r.ability_haste ?? 0,
          attackSpeed: this._dampen(r.attack_speed ?? 1.0),
          energyRegen: this._dampen(r.energy_regen ?? 1.0),
          tenacity: this._dampen(r.tenacity ?? 1.0),
          movementSpeed: this._dampen(r.movement_speed ?? 1.0)
        }
      }
    }

    if (this._aram && key === 'aram') {
      const ae = this._aram.data?.find((d: any) => d.champion_id === cid)
      if (ae && !ae.default) {
        return {
          damageDealt: this._dampen(ae.damage_dealt ?? 1.0),
          damageTaken: this._dampen(ae.damage_taken ?? 1.0),
          healing: this._dampen(ae.healing ?? 1.0),
          shielding: this._dampen(ae.shield_amount ?? 1.0),
          abilityHaste: ae.cooldown_reduction ?? 0,
          attackSpeed: this._dampen(ae.attack_speed ?? 1.0),
          energyRegen: this._dampen(ae.energy_regen ?? 1.0),
          tenacity: this._dampen(ae.tenacity ?? 1.0),
          movementSpeed: 1.0
        }
      }
    }
    return null
  }

  clear(): void { this._balance = null; this._aram = null; this._loadedAt = 0 }
}

// ── MetaIngestor ─────────────────────────────────────────────────────

export type ChampionMetaListener = (meta: ChampionMetaWithBalance) => void

export class MetaIngestor {
  private _cfg: MetaIngestorConfig
  private _cache: ChampionMetaCache
  private _norm: OpggNormalizer
  private _merger: FandomBalanceMerger
  private _listeners: Set<ChampionMetaListener> = new Set()
  private _active: number = 0; private _total: number = 0; private _errors: number = 0
  private _durations: number[] = []
  private _lastFetch: number = 0
  private _inflight: Map<string, Promise<ChampionMeta | null>> = new Map()
  private _fetchChampion: (opts: any) => Promise<any>
  private _fetchAram: (() => Promise<any>) | null
  private _fetchFandom: (() => Promise<any>) | null

  constructor(
    fetchers: { fetchChampion: (opts: any) => Promise<any>; fetchAramBalance?: () => Promise<any>; fetchFandomBalance?: () => Promise<any> },
    config?: Partial<MetaIngestorConfig>
  ) {
    this._cfg = { ...DEFAULT_CONFIG, ...config }
    this._cache = new ChampionMetaCache(this._cfg.maxCacheSize, this._cfg.cacheTtlMs)
    this._norm = new OpggNormalizer()
    this._merger = new FandomBalanceMerger()
    this._fetchChampion = fetchers.fetchChampion
    this._fetchAram = fetchers.fetchAramBalance ?? null
    this._fetchFandom = fetchers.fetchFandomBalance ?? null

    introspector.registerProbe('meta-ingestor', () => ({
      cacheSize: this._cache.size, cacheHitRatio: this._cache.stats.ratio.toFixed(3),
      activeFetches: this._active, totalFetches: this._total
    }))
  }

  get cache() { return this._cache }
  get balanceMerger() { return this._merger }
  onMeta(l: ChampionMetaListener) { this._listeners.add(l); return () => { this._listeners.delete(l) } }

  async loadBalanceData(): Promise<boolean> {
    let loaded = false
    if (this._fetchFandom) { try { this._merger.setFandomBalance(await this._fetchFandom()); loaded = true } catch {} }
    if (this._fetchAram) { try { this._merger.setAramBalance(await this._fetchAram()); loaded = true } catch {} }
    return loaded
  }

  async ingestChampion(params: { championId: number; region?: string; mode?: string; tier?: string; position?: string; gameMode?: string }): Promise<ChampionMetaWithBalance | null> {
    const region = params.region ?? this._cfg.defaultRegion
    const tier = params.tier ?? this._cfg.defaultTier
    const mode = params.mode ?? 'ranked'
    const pos = params.position ?? 'all'
    const gm = params.gameMode ?? 'CLASSIC'
    const key = buildCacheKey(params.championId, region, mode, tier, pos)

    const cached = this._cache.get(key)
    if (cached) {
      return { ...cached, balance: this._merger.getBalanceModifiers(params.championId, gm) }
    }

    const existing = this._inflight.get(key)
    if (existing) {
      const meta = await existing
      if (!meta) return null
      return { ...meta, balance: this._merger.getBalanceModifiers(params.championId, gm) }
    }

    const promise = this._doFetch(params.championId, region, mode, tier, pos)
    this._inflight.set(key, promise)
    try {
      const meta = await promise
      if (!meta) return null
      this._cache.set(key, meta)
      const result: ChampionMetaWithBalance = { ...meta, balance: this._merger.getBalanceModifiers(params.championId, gm) }
      for (const l of this._listeners) { try { l(result) } catch {} }
      return result
    } finally { this._inflight.delete(key) }
  }

  async ingestDraft(params: { championIds: number[]; region?: string; tier?: string; gameMode?: string; positions?: Record<number, string> }): Promise<Map<number, ChampionMetaWithBalance>> {
    const results = new Map<number, ChampionMetaWithBalance>()
    await Promise.allSettled(params.championIds.filter(id => id > 0).map(async cid => {
      const meta = await this.ingestChampion({ championId: cid, region: params.region, tier: params.tier, gameMode: params.gameMode, position: params.positions?.[cid] })
      if (meta) results.set(cid, meta)
    }))
    return results
  }

  getStats(): MetaIngestorStats {
    const cs = this._cache.stats
    const avg = this._durations.length > 0 ? this._durations.reduce((a, b) => a + b, 0) / this._durations.length : 0
    return { cacheHits: cs.hits, cacheMisses: cs.misses, cacheSize: cs.size,
      totalFetches: this._total, totalErrors: this._errors, activeFetches: this._active,
      balanceDataLoaded: this._merger.isLoaded, lastFetchTimestamp: this._lastFetch,
      avgFetchDurationMs: Math.round(avg * 100) / 100 }
  }

  clear(): void { this._cache.clear(); this._merger.clear(); this._inflight.clear(); this._durations = [] }
  dispose(): void { this.clear(); this._listeners.clear() }

  // Changed: exponential backoff with jitter
  private async _doFetch(cid: number, region: string, mode: string, tier: string, pos: string): Promise<ChampionMeta | null> {
    this._active++; this._total++; this._lastFetch = Date.now()
    const t0 = Date.now()

    for (let attempt = 0; attempt <= this._cfg.retryCount; attempt++) {
      try {
        const raw = await this._fetchChampion({ id: cid, region, mode, tier, position: pos })
        this._active--
        this._durations.push(Date.now() - t0)
        if (this._durations.length > 100) this._durations = this._durations.slice(-50)

        if (mode === 'arena') return this._norm.normalizeArena(cid, raw, region, tier)
        if (mode === 'aram') return this._norm.normalizeAram(cid, raw, region, tier)
        return this._norm.normalizeRanked(cid, raw, region, tier, pos)
      } catch {
        if (attempt < this._cfg.retryCount) {
          // Exponential backoff with jitter
          const delay = this._cfg.retryBaseMs * Math.pow(2, attempt) + Math.random() * 200
          await new Promise(r => setTimeout(r, delay))
        }
      }
    }
    this._active--; this._errors++
    return null
  }
}

// ── Factory ──────────────────────────────────────────────────────────

export function createMetaIngestor(
  fetchers: { fetchChampion: (opts: any) => Promise<any>; fetchAramBalance?: () => Promise<any>; fetchFandomBalance?: () => Promise<any> },
  config?: Partial<MetaIngestorConfig>
): MetaIngestor {
  return new MetaIngestor(fetchers, config)
}

// ── Debug ────────────────────────────────────────────────────────────

export function debugPrintMetaIngestorReport(mi: MetaIngestor): void {
  const s = mi.getStats()
  console.log('\n╔══════════════════════════════════════════════╗')
  console.log('║   NexusMetaIngestor — Report                 ║')
  console.log('╠══════════════════════════════════════════════╣')
  console.log(`║ Cache size:  ${String(s.cacheSize).padEnd(32)}║`)
  console.log(`║ Hits:        ${String(s.cacheHits).padEnd(32)}║`)
  console.log(`║ Misses:      ${String(s.cacheMisses).padEnd(32)}║`)
  console.log(`║ Fetches:     ${String(s.totalFetches).padEnd(32)}║`)
  console.log(`║ Errors:      ${String(s.totalErrors).padEnd(32)}║`)
  console.log(`║ Balance:     ${String(s.balanceDataLoaded).padEnd(32)}║`)
  console.log('╚══════════════════════════════════════════════╝\n')
}
