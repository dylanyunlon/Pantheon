M49-M60: Ontology Layer — Real-Time Game Data as PLTR Input
============================================================

Author: dylanyunlon <dogechat@163.com>
Depends-on: M1-M48

Positioning
-----------

Pantheon is not a coaching tool. It is a Foundry-class ontology platform
for League of Legends. The advisor pipeline is one consumer of the ontology.

PLTR OSDK has: Object, ObjectSet, Link, Action, Pipeline, Observable, Store.
Pantheon maps these to: Player, Champion, Game, Match, Rune, Item objects,
linked by relationships (played, selected, counters, buildsWith), fed by
real-time game event streams from 7 data sources.

The game itself is the data stream. Every phase transition, every pick/ban,
every item purchase, every kill event is an ontology write. The advisor reads
from the ontology. So does the training pipeline. So does the replay viewer.
So does any future consumer.

Real-Time Game Data Streams (What Flows During One Game)
--------------------------------------------------------

Phase 1: Pre-Game (Lobby → Matchmaking)
  Stream: LCU WebSocket events
  Events:
    /lol-lobby/v2/lobby                    → party composition, queue selection
    /lol-matchmaking/v1/search             → estimated wait time, search state
    /lol-matchmaking/v1/ready-check        → accept/decline per player
  Cadence: event-driven, ~1-5 events/sec during matchmaking
  Ontology writes:
    Player.queuedAt, Player.queueType, Party.members[], Match.created

Phase 2: Champion Select
  Stream: LCU WebSocket + LCU REST polling
  Events:
    /lol-champ-select/v1/session           → full session state per action tick
      .actions[][]                         → ban/pick actions with cellId, championId, completed
      .myTeam[] / .theirTeam[]             → puuid, championId, assignedPosition, spell1/2
      .timer                               → phase timer (ban/pick/finalization)
      .trades[] / .pickOrderSwaps[]        → swap requests between teammates
    /lol-champ-select/v1/summoners/{cell}  → per-cell summoner detail
  REST polls during select:
    /lol-perks/v1/currentpage              → player's active rune page
    /lol-perks/v1/recommended-pages-position/champion/{id} → recommended runes
  SGP enrichment (background, per player discovered):
    getMatchHistory(puuid)                 → 20 recent games, 641 fields per participant
    getRankedStats(puuid)                  → tier/division/LP per queue
    getSummoner(puuid)                     → summoner level, profile icon
  OPGG enrichment (per champion selected):
    getChampion(id, region, mode, tier)    → win/pick/ban rate, core items, rune pages, counters
  Cadence: session event every 1-3 sec, REST polls per player, SGP/OPGG per discovery
  Ontology writes:
    Match.draft[] (ordered ban/pick sequence)
    Player→selected→Champion, Player.position, Player.runes
    Champion.metaTier, Champion.winRate, Champion→counters→Champion

Phase 3: Loading Screen → In-Game
  Stream: LiveClientData (127.0.0.1:2999) polling
  Endpoints polled every 1-2 sec:
    /liveclientdata/allgamedata            → full snapshot: all 10 players
    /liveclientdata/playerlist             → per-player: champion, level, items[], scores, isDead, respawnTimer
    /liveclientdata/eventdata              → kill/dragon/baron/tower/inhibitor events with gameTime
    /liveclientdata/gamestats              → gameMode, gameTime (float seconds), mapName
    /liveclientdata/activeplayer           → self abilities, runes, level, gold (estimated)
  Cadence: 0.5-2 Hz polling, ~30 min game → ~900-3600 snapshots
  Ontology writes:
    GameEvent[] (kill at t=342s, dragon at t=621s, baron at t=1823s)
    Player.items[] (per snapshot → item purchase timeline)
    Player.scores (kills/deaths/assists/cs/wards per snapshot → time series)
    Player.level (per snapshot → XP curve)
    Match.goldDifferential[] (derived: sum(team1.gold) - sum(team2.gold) per timestamp)
    Match.objectiveSequence[] (dragon types in order, tower plate count)

Phase 4: Post-Game
  Stream: LCU REST + SGP REST
  Endpoints:
    /lol-end-of-game/v1/gameclient-eog-stats-block → full stats for all players
    /lol-honor-v2/v1/ballot                         → honor voting state
    SGP getEndOfGameStats(gameId)                   → extended stats with challenges
    SGP getGameDetails(gameId)                      → timeline events (minute-by-minute)
  Fandom enrichment:
    getBalance()                                    → mode-specific damage multipliers
  Cadence: one-shot after game ends
  Ontology writes:
    Match.outcome, Match.duration, Match.gameMode
    Participant[] (per-player full stats: damage breakdown, gold, vision, KP)
    Player.matchHistory.append(this match)
    TrainingSample (feature vector + outcome label)

Data Volume Per Game Session
----------------------------

  Source            | Requests | Payload   | Ontology Objects
  LCU REST          | ~50-80   | ~2-5 MB   | Player x10, Match x1
  LCU WebSocket     | ~200-500 | ~1-3 MB   | Events, state transitions
  SGP Remote        | ~10-20   | ~3-8 MB   | MatchHistory x10, RankedStats x10
  OPGG              | ~5-10    | ~0.5-2 MB | ChampionMeta x10
  LiveClientData    | ~900-3600| ~10-40 MB | GameEvent[], Snapshot[]
  Fandom/Gtimg      | ~2-3     | ~0.1 MB   | BalanceData
  Total per game    | ~1200-4200| ~17-58 MB | ~100+ typed objects, ~1000+ events

Task Assignment
---------------

M49 (Claude #49): Ontology type definitions
  Files: src/shared/ontology/types.ts, index.ts
  Define the core ontology types that all consumers share:
    ObjectTypes: Player, Champion, Game, Match, Participant, Rune, Item,
                 GameEvent, DraftAction, Snapshot, TrainingSample
    LinkTypes: Player→selected→Champion, Player→played→Match,
              Match→contains→Participant, Champion→counters→Champion,
              Item→buildsFrom→Item
    ActionTypes: RecordDraft, RecordEvent, RecordSnapshot, RecordOutcome,
                 ApplyRune, UpdateMeta
  No business logic. Pure type declarations. Like OSDK's
  packages/api/src/ontology — the schema that everything else references.

M50 (Claude #50): Ingestion pipeline — LCU event stream → ontology writes
  Files: src/shared/ontology/ingestion/lcu-ingestor.ts
  Subscribe to ALL LCU WebSocket events (not just the current ~15).
  On each event: classify by URI, parse payload, emit typed ontology write.
  gameflow-phase change → Match lifecycle transition.
  champ-select session update → DraftAction[] append.
  lobby update → Party/Player link updates.
  Ring buffer of recent events for replay. Event deduplication by sequence ID.

M51 (Claude #51): Ingestion pipeline — SGP enrichment → ontology writes
  Files: src/shared/ontology/ingestion/sgp-ingestor.ts
  When M50 discovers new puuids (from champ select / gameflow session),
  trigger SGP enrichment: getMatchHistory, getRankedStats, getSummoner.
  Parse the full 641-field SgpParticipantLol.challenges into typed dimensions.
  Write to Player.matchHistory, Player.rankedStats, Player.summonerProfile.
  Deduplication: skip if puuid already enriched in this session.

M52 (Claude #52): Ingestion pipeline — LiveClientData → ontology writes
  Files: src/shared/ontology/ingestion/live-ingestor.ts
  Poll /liveclientdata/allgamedata at configurable interval (default 2s).
  Diff each snapshot against previous to detect: new kills, item purchases,
  level-ups, objective takes, death/respawn transitions.
  Emit GameEvent objects with precise gameTime timestamps.
  Compute derived time series: gold differential, XP curves, CS/min.
  Ring buffer of snapshots. Axios interceptor to dump raw responses for M56.

M53 (Claude #53): Ingestion pipeline — OPGG + Fandom meta → ontology writes
  Files: src/shared/ontology/ingestion/meta-ingestor.ts
  When champions are selected (from M50 draft events), fetch OPGG data:
  getChampion(id, region, mode, tier) for each champion in the game.
  Write Champion.metaTier, Champion.winRate, Champion.counterMatchups,
  Champion.optimalRunes, Champion.coreItems.
  Merge Fandom balance data for non-SR modes (ARAM damage multipliers).
  Cache layer: champion meta changes slowly, TTL 1 hour.

M54 (Claude #54): Object store — typed in-memory ontology store
  Files: src/shared/ontology/store/object-store.ts
  Like OSDK's Store.ts: keyed by (objectType, primaryKey).
  Supports: write, read, query by type, link traversal, subscribe.
  Optimistic writes (for live event streaming).
  Cache layers with TTL and LRU eviction.
  Change notification via listener sets (like OSDK's Subjects.ts).
  Replaces the scattered mobx state across ongoing-game, lc-state, advisor.

M55 (Claude #55): ObjectSet — query and filter over the ontology store
  Files: src/shared/ontology/store/object-set.ts
  Like OSDK's ObjectSet.ts: filter/sort/aggregate over typed objects.
  WhereClause: { type: 'Player', winRate: { $gt: 0.6 }, rank: { $gte: 'DIAMOND' } }
  OrderBy: { field: 'mmr', direction: 'desc' }
  Aggregation: count, avg, min, max, sum over numeric fields.
  Pipeline composition: objectSet.where(...).orderBy(...).fetchPage(0, 10).
  Used by advisor pipeline instead of raw playerAnalyses iteration.

M56 (Claude #56): Pipeline — source-to-ontology transformation chain
  Files: src/shared/ontology/pipeline/transform-pipeline.ts
  Like OSDK's pipeline/createPipeline.ts.
  Declarative stage chain: RawLcuEvent → ClassifiedEvent → TypedOntologyWrite.
  Each stage is a pure function (input → output), composable.
  Pipeline registry: register named pipelines, execute by name.
  Replaces the current PantheonPipeline (which mixes transformation with advice generation).
  Advice generation becomes a consumer pipeline, not THE pipeline.

M57 (Claude #57): Observable — real-time subscriptions to ontology changes
  Files: src/shared/ontology/observable/observable-client.ts
  Like OSDK's observable/internal/ObservableClientImpl.ts.
  Subscribe to: single object by key, object set by query, link set by source.
  Batched notifications (coalesce rapid writes into single notification).
  Auto-unsubscribe on component unmount (disposable pattern).
  Replaces current PantheonObservableStore with ontology-native subscriptions.
  The advisor's mobx reactions become ontology observable subscriptions.

M58 (Claude #58): Actions — typed write operations on the ontology
  Files: src/shared/ontology/actions/action-registry.ts
  Like OSDK's actions/applyAction.ts.
  Typed action definitions: RecordDraft({ matchId, actions[] }),
  RecordEvent({ matchId, eventType, gameTime, participants[] }),
  RecordOutcome({ matchId, outcome, stats }).
  Validation before write (ActionValidationError).
  Action log for audit trail. Undo support for optimistic writes.

M59 (Claude #59): Advisor as ontology consumer
  Files: refactor src/main/shards/advisor/ to read from ontology store
  The advisor pipeline becomes a CONSUMER of the ontology, not the data owner.
  generateAdvices reads from ObjectStore instead of receiving raw params.
  ProfilePass queries ontology: objectSet('Player').where({ matchId: current }).
  Pipeline stages query ontology: objectSet('Champion').where({ id: enemyChampId }).metaTier.
  Coordinator reads from ontology: objectSet('GameEvent').where({ type: 'kill' }).count().

M60 (Claude #60): Training pipeline as ontology consumer
  Files: refactor training/capture to read from ontology store
  TrainingSample generation reads from ontology:
    feature vector = objectSet('Participant').where({ matchId }).aggregate(...)
    outcome label = object('Match', matchId).outcome
  Replay analysis reads from ontology:
    objectSet('GameEvent').where({ matchId }).orderBy('gameTime')
  Export pipeline serializes ontology objects to JSON/CSV.
  The ontology IS the training data warehouse.

Architecture
------------

  LCU WS ─── M50 LcuIngestor ───┐
  SGP REST ── M51 SgpIngestor ───┤
  LiveClient ─ M52 LiveIngestor ──┼── M56 Pipeline ── M54 ObjectStore
  OPGG ─────── M53 MetaIngestor ──┤        │               │
  Fandom ───── M53 MetaIngestor ──┘        │          M55 ObjectSet
                                           │               │
                                      M58 Actions      M57 Observable
                                           │               │
                                      ┌────┴────┐     ┌────┴────┐
                                      │ M59     │     │ M60     │
                                      │ Advisor │     │Training │
                                      │Consumer │     │Consumer │
                                      └─────────┘     └─────────┘

vs PLTR OSDK:

  Foundry APIs ── OSDK Pipeline ── ObjectStore ── ObjectSet ── Observable
                                       │
                                   Actions
                                       │
                               ┌───────┴───────┐
                               │ Applications  │
                               └───────────────┘
