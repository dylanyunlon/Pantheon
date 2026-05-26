M54: Object Store — Typed In-Memory Ontology Store
====================================================

Author: dylanyunlon <dogechat@163.com>
Milestone: M54 (Claude #54)
Depends-on: M1-M53

4 files changed, +765/-0 (2 new, 2 modified)

Part A: ObjectStore — (objectType, primaryKey) Keyed Store with Links
----------------------------------------------------------------------

From PantheonObservableStore.write as the good example. Then,
following that pattern, implement ObjectEntry to let the store hold
typed objects keyed by (objectType, primaryKey), and enabling
type-safe reads without runtime casts. Next, LinkRegistry introduces
directional link storage, making the store able to traverse
relationships between objects (Player selected Champion, Match
contains Participant) in O(1) per link lookup via forward and
reverse indexes, while ObjectEntry optimizes staleness detection
with per-entry TTL tracking. Subsequently, ObjectStore integrates
ObjectEntry, LinkRegistry, and a subscription system (modeled on
PantheonObservableStore.subscribe), letting consumers observe
single objects by key, all objects of a type, or link sets by
source, and OptimisticLayer enables speculative writes that can
be committed or rolled back without corrupting truth state.
Finally, ObjectStoreBatch (beginBatch/commitBatch) completes the
transaction model, ensuring multiple writes coalesce into a single
change notification, comprehensively upgrading the scattered mobx
state to a unified typed ontology store with link traversal.

Files Created (2 files, 700 lines)
-----------------------------------

1. src/shared/ontology/store/object-store.ts (678 lines)
   - OntologyObjectType: 11-member union (Player, Champion, Game,
     Match, Participant, Rune, Item, GameEvent, DraftAction,
     Snapshot, TrainingSample) — matches M49 ontology spec
   - OntologyLinkType: 8-member union (selected, played, contains,
     counters, buildsFrom, buildsWith, equips, usesRune)
   - ObjectKey: { objectType, primaryKey } composite key
   - ObjectEntry<T>: versioned entry with key, value, version,
     createdAt, updatedAt, expiresAt, status (active/deleted/optimistic)
   - LinkEntry: directed edge with sourceType/Key, linkType,
     targetType/Key, createdAt, metadata
   - ObjectStoreChange: union discriminated change record for
     write/delete/link-add/link-remove notifications
   - LinkRegistry: bidirectional link store with:
     * Forward index: source+linkType -> Set<linkKey> for O(1) getLinksFrom
     * Reverse index: target+linkType -> Set<linkKey> for O(1) getLinksTo
     * addLink/removeLink/getLinksFrom/getLinksTo/removeAllLinksFor/hasLink
   - OptimisticLayer: speculative write buffer per layerId.
     * write(): stages an ObjectEntry without touching truth store
     * markDelete(): stages a delete without touching truth store
     * affectedKeys: list of all keys modified in this layer
   - ObjectStore: the main class.
     * write<T>(): creates/updates ObjectEntry, maintains type index,
       TTL, eviction, notifies listeners
     * read<T>(): reads through optimistic layers first, then truth,
       with TTL expiry check
     * delete(): marks deleted, removes from type index, cleans links
     * queryByType<T>(): returns all active objects of a type
     * queryEntries(): returns ObjectEntry[] for a type
     * countByType(): count without materializing
     * addLink/removeLink: delegates to LinkRegistry + notifications
     * getLinkedObjects<T>(): traverses links and reads target objects
     * getLinksFrom/getLinksTo/hasLink: link query delegation
     * writeOptimistic/commitOptimistic/rollbackOptimistic: speculative
       write lifecycle (create layer -> commit to truth | rollback)
     * subscribe<T>(): per-object listener with immediate current-value
       delivery on subscribe (same pattern as PantheonObservableStore)
     * subscribeType(): per-type listener for batch changes
     * subscribeLinks(): link change listener
     * onChange(): global change listener
     * beginBatch/commitBatch/rollbackBatch: transaction model that
       coalesces writes into single notification burst
     * startGc/stopGc: periodic TTL expiry sweep
     * Per-type eviction: when maxObjectsPerType exceeded, evicts
       oldest-updated entry
   - createObjectStore(): factory function

2. src/shared/ontology/store/index.ts (22 lines)
   Barrel export

Files Modified (2 files, +65/-0)
----------------------------------

3. src/shared/utils/engine.ts (+53)
   - Import ObjectStore, createObjectStore, and types from ontology/store
   - Add _ontologyStore field, initialized in constructor with GC started
   - get ontologyStore: direct accessor
   - getOntologyStoreStats(): stats delegation
   - ontologyWrite<T>(): typed write shortcut
   - ontologyRead<T>(): typed read shortcut
   - ontologyQueryByType<T>(): type query shortcut
   - ontologyAddLink(): link creation shortcut
   - ontologyGetLinked<T>(): linked object traversal shortcut
   - ontologySubscribe<T>(): per-object subscription shortcut
   - ontologySubscribeType(): per-type subscription shortcut
   - ontologyOnChange(): global listener shortcut
   - clearCache(): added _ontologyStore.clear()
   - dispose(): added _ontologyStore.dispose()

User-Angle Critique
---------------------

1. read<T>() checks optimistic layers before truth. If multiple
   optimistic layers exist (layerA writes Player:abc, layerB also
   writes Player:abc), the last-iterated layer wins. Map iteration
   order in V8 is insertion order, so the most recently created layer
   takes precedence. This is correct for stacking optimistic writes.

2. queryByType materializes all objects into an array. For types with
   many entries (GameEvent could have 1000+), this allocates a new
   array each call. The M55 ObjectSet will provide lazy iteration
   to avoid this. For now, the array is acceptable given desktop
   memory budget.

3. subscribe delivers the current value immediately if the object
   exists. If the object doesn't exist yet, the listener receives
   nothing until the first write. This matches PantheonObservableStore
   behavior. Callers should handle the initial-absence case.

4. Link removal on object delete (removeAllLinksFor) scans all links.
   With <2000 links per game session, this is O(n) with n small.
   A future milestone could add per-object link indexes for O(1)
   cleanup, but the current approach is simpler and sufficient.

5. The type index eviction (oldest-updated) is not true LRU. If a
   stale object is frequently read but never written, it won't be
   evicted. This is acceptable because game objects are either
   actively updated (snapshots, events) or static (champion meta).

System-Angle Critique
-----------------------

1. ObjectStore is not thread-safe. In Electron main process (single
   threaded), this is fine. If used in a worker, external
   synchronization is needed. The optimistic layer pattern assumes
   single-writer semantics.

2. The version counter is a monotonic integer. At 1000 writes/sec
   for a 30-min game, it reaches ~1.8M — well within Number.MAX_SAFE_INTEGER.
   No overflow risk for any realistic session.

3. GC runs on setInterval. If the store is cleared/disposed between
   GC ticks, the timer is properly cleaned up via stopGc(). No
   dangling timer risk.

4. Batch mode suppresses per-write object notifications but still
   fires them in commitBatch. This means listeners see a burst of
   notifications on commit rather than one-at-a-time. For UI
   consumers, this reduces unnecessary re-renders during bulk
   ingestion (e.g., loading 10 players' match history at once).
