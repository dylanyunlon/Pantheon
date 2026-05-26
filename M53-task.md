M53: Ingestion Pipeline — OPGG + Fandom Meta to Ontology Writes
==================================================================

Author: dylanyunlon <dogechat@163.com>
Milestone: M53 (Claude #53)
Depends-on: M1-M52

4 files changed, +688/-0 (1 new, 3 modified)

Part A: MetaIngestor — Cached Champion Meta Resolution with Balance Merging
-----------------------------------------------------------------------------

From ExtraAssetsMain._updateFandomBalance as the good example.
Then, following that pattern, implement ChampionMetaCache to let
the ingestor serve repeated champion lookups from a TTL-bounded
in-memory cache, and enabling sub-millisecond meta resolution
during champion select without redundant HTTP calls. Next,
OpggNormalizer introduces structured extraction from the
polymorphic OpggNormalModeChampion response, making the ingestor
able to produce typed ChampionMeta objects with winRate, pickRate,
banRate, metaTier, counterMatchups, optimalRunes, and coreItems,
while ChampionMetaCache optimizes invalidation with per-champion
TTL tracking for O(1) staleness checks. Subsequently,
FandomBalanceMerger integrates the Fandom BalanceType data,
letting non-SR modes (ARAM, URF, Arena) receive mode-specific
damage multipliers alongside OPGG stats, and ArenaMetaNormalizer
(in OpggNormalizer.normalizeArena) enables structured extraction
from the OpggArenaModeChampion response without duplicating the
ranked normalizer logic. Finally, MetaIngestor orchestrates all
four subsystems, ensuring draft event listeners trigger per-champion
fetches that populate the cache and notify downstream consumers,
comprehensively upgrading meta data access from scattered ad-hoc
API calls to a unified cached ontology-writable pipeline.

Files Created (1 file, 636 lines)
-----------------------------------

1. src/shared/ontology/ingestion/meta-ingestor.ts (636 lines)
   - ChampionMeta: normalized champion meta with 17 typed fields
     (championId, region, mode, tier, position, winRate, pickRate,
     banRate, metaTier, metaRank, kda, counterMatchups, optimalRunes,
     coreItems, bootOptions, starterItems, skillOrder)
   - CounterMatchup: (championId, games, wins, winRate) from OPGG counters
   - RunePageMeta: (primaryPageId, secondaryPageId, rune arrays, stats)
   - ItemBuildMeta: (itemIds[], games, wins, winRate, pickRate)
   - SkillOrderMeta: (order[], games, wins, winRate, pickRate)
   - BalanceModifiers: 9-field normalized Fandom balance (damageDealt,
     damageTaken, healing, shielding, abilityHaste, attackSpeed,
     energyRegen, tenacity, movementSpeed) with 1.0 defaults
   - ChampionMetaWithBalance: ChampionMeta + nullable BalanceModifiers
   - gameModeToOpggMode(): maps game mode strings to OPGG ModeType
   - gameModeToFandomKey(): maps game mode strings to Fandom balance keys
   - ChampionMetaCache: TTL-bounded LRU-like cache keyed by
     championId:region:mode:tier:position. Supports get/set/has/invalidate/
     invalidateByChampion. Eviction by least-accessed when at capacity.
     Exposes hit/miss/ratio stats.
   - OpggNormalizer: extracts structured ChampionMeta from three OPGG
     response shapes:
     * normalizeRanked(): from OpggNormalModeChampion — extracts summary
       stats, counter matchups from positions[].counters, rune pages from
       rune_pages[].builds[0], core/boot/starter items, skill masteries
     * normalizeAram(): delegates to normalizeRanked with mode/position override
     * normalizeArena(): from OpggArenaModeChampion — extracts arena-specific
       stats (win/play/total_place/first_place), core items, boots, skills
   - FandomBalanceMerger: holds Fandom BalanceType data + OPGG ARAM balance.
     getBalanceModifiers(championId, gameMode) returns BalanceModifiers
     by looking up Fandom data first (covers all modes), falling back to
     OPGG ARAM balance for ARAM-specific data. Returns null for SR (no
     balance modifications apply).
   - MetaIngestor: the main class. Accepts three fetcher functions
     (fetchChampion, fetchAramBalance, fetchFandomBalance) for decoupling.
     * ingestChampion(): cache-first lookup, inflight dedup, async fetch
       with retry, cache write, listener notification, balance merging
     * ingestDraft(): parallel ingestion of all champion IDs in a draft
       via Promise.allSettled (one failure does not block others)
     * loadBalanceData(): fetches both Fandom and OPGG ARAM balance data
     * Inflight dedup: concurrent requests for the same champion:region:mode
       share one Promise instead of issuing duplicate HTTP calls
     * Retry with linear backoff: configurable retryCount * retryDelayMs
     * Listener pattern: onMeta(listener) with unsubscribe return
   - createMetaIngestor(): factory function

Files Modified (3 files, +52/-0)
----------------------------------

2. src/shared/ontology/ingestion/index.ts (+22)
   Added MetaIngestor, createMetaIngestor, ChampionMetaCache, OpggNormalizer,
   FandomBalanceMerger class exports. Added ChampionMeta, ChampionMetaWithBalance,
   CounterMatchup, RunePageMeta, ItemBuildMeta, SkillOrderMeta, BalanceModifiers,
   MetaIngestorConfig, MetaIngestorStats, ChampionMetaListener type exports.

3. src/shared/utils/engine.ts (+26)
   - Import MetaIngestor, createMetaIngestor and types from ontology/ingestion
   - Add _metaIngestor field (MetaIngestor | null = null) to PantheonEngine
   - initMetaIngestor(): factory that accepts fetchers + config
   - get metaIngestor: accessor
   - getMetaIngestorStats(): delegates to _metaIngestor.getStats()
   - ingestChampionMeta(championId, gameMode?): single champion ingestion
   - ingestDraftMeta(championIds, gameMode?): batch draft ingestion
   - onChampionMeta(listener): subscribe to meta events
   - clearCache(): added _metaIngestor.clear()
   - dispose(): added _metaIngestor.dispose() + null assignment

User-Angle Critique
---------------------

1. ingestDraft uses Promise.allSettled, so one champion fetch timeout does not
   block the other 9. The caller receives partial results (Map has only the
   champions that succeeded). The UI should handle missing entries gracefully
   by showing "loading" for unfetched champions.

2. The cache key includes position ("top", "mid", etc). If the user's position
   assignment changes mid-draft (swap), the cache correctly treats them as
   separate entries. However, if position is "all" initially and later resolved
   to "mid", the "all" entry is not invalidated. Both entries coexist, and the
   more-specific one takes priority on subsequent lookups only if the caller
   passes the resolved position. Callers should prefer specific positions.

3. Fandom balance data is loaded once via loadBalanceData(). If the game patches
   mid-session (unlikely but possible during long maintenance windows), the
   balance data becomes stale. The balanceCacheTtlMs (2 hours) provides a
   reasonable upper bound, but loadBalanceData must be called again manually.

4. OPGG ARAM champion data uses the same OpggNormalModeChampion response shape
   as ranked. normalizeAram delegates to normalizeRanked and overrides mode/
   position. This means ARAM counters (if OPGG ever adds them) will be
   extracted automatically without code changes.

5. Arena mode has no counter matchups (OPGG doesn't provide them for 2v2v2v2).
   The counterMatchups array is empty for arena. The UI should hide the
   counter section when mode is arena.

System-Angle Critique
-----------------------

1. Inflight dedup shares a single Promise across concurrent callers. If the
   fetch fails, all waiters receive null. This is correct: retrying from
   one waiter would create a second parallel request, violating dedup semantics.
   The caller should retry at a higher level if needed.

2. The cache eviction policy is "least accessed" (lowest accessCount). This is
   not true LRU but approximates it for the champion meta use case where
   popular champions are looked up frequently. True LRU would require a
   doubly-linked list, which is overkill for maxCacheSize=300.

3. FandomBalanceMerger stores two separate data sources (Fandom raw + OPGG
   ARAM balance). Fandom data is preferred because it covers all modes.
   OPGG ARAM balance is a fallback for the specific case where Fandom fails
   to load but OPGG ARAM balance succeeds. The two sources may disagree on
   values; Fandom is authoritative when both are present.

4. The import path in engine.ts uses `as Parameters<typeof createMetaIngestor>[0]`
   to cast the loosely-typed fetcher signatures to the strict OPGG types.
   This allows engine.ts callers to pass fetchers without importing OPGG types
   directly. The cast is safe because MetaIngestor internally handles type
   narrowing via mode-based branching in _doFetch.
