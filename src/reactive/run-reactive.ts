// @ts-nocheck
/**
 * run-reactive.ts — exercises every OSDK-ported algorithm + game lifecycle
 *
 * Tests:
 *   1. Trie: lookupArray identity, peekArray, removeArray with branch pruning
 *   2. TrieCanonicalizer: structural dedup via sorted-key fingerprint + WeakRef buckets
 *   3. WhereCanonicalizer: $and unwrap, empty $and, $eq shorthand, key sorting
 *   4. evaluateFilter: all ops + strict/loose mode
 *   5. objectMatchesWhere: recursive $and/$or/$not
 *   6. InvalidationGraph: per-type cascade sorted by priority
 *   7. CacheKeyRegistry: trie-backed identity + trailing-undefined normalization
 *   8. Full game lifecycle through ReactiveStore + IncrementalPipeline + OptimisticAdvisor
 */

import { NexusIntrospector } from '../debug/introspector'
import { Trie, TrieCanonicalizer, WhereCanonicalizer, InvalidationGraph, CacheKeyRegistry, evaluateFilter, objectMatchesWhere } from './canonicalize'
import { createReactiveStore, debugPrintStoreSnapshot } from './store'
import { createIncrementalPipeline, debugPrintIncrementalReport } from './incremental-pipeline'
import { createOptimisticAdvisor } from './optimistic-advisor'
import { createGameBridge, debugPrintBridgeState } from './game-bridge'

function assert(cond, msg) { if (!cond) { console.error(`✗ ASSERT FAILED: ${msg}`); process.exit(1) } }

export async function runReactiveDemo() {
  const t0 = Date.now()
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║     OSDK ALGORITHM TESTS + GAME LIFECYCLE                  ║')
  console.log('╠══════════════════════════════════════════════════════════════╣')

  // ── 1. Trie ──
  console.log('\n── 1. Trie ─────────────────────────────────────────────────')
  const trie = new Trie((keys) => keys.join(':'))
  const v1 = trie.lookupArray(['player', 'SELF', 'analysis'])
  const v2 = trie.lookupArray(['player', 'SELF', 'analysis'])
  assert(v1 === v2, 'same path → same value (reference identity)')
  assert(v1 !== trie.lookupArray(['player', 'ENMY']), 'different path → different value')
  assert(trie.peekArray(['player', 'SELF', 'analysis']) === v1, 'peekArray finds existing')
  assert(trie.peekArray(['nonexistent']) === undefined, 'peekArray returns undefined for missing')
  trie.removeArray(['player', 'SELF', 'analysis'])
  assert(trie.peekArray(['player', 'SELF', 'analysis']) === undefined, 'removeArray deletes + prunes branches')
  console.log('  ✓ lookupArray identity, peekArray, removeArray + branch prune')

  // ── 2. TrieCanonicalizer ──
  console.log('\n── 2. TrieCanonicalizer ────────────────────────────────────')
  const canon = new TrieCanonicalizer()
  const obj1 = { a: 1, b: 'x', c: [1, 2] }
  const obj2 = { b: 'x', a: 1, c: [1, 2] }  // same structure, different key order
  const obj3 = { a: 1, b: 'x', c: [1, 3] }  // different value
  const c1 = canon.canonicalize(obj1)
  const c2 = canon.canonicalize(obj2)
  const c3 = canon.canonicalize(obj3)
  assert(c1 === c2, 'structurally identical → same reference (key order irrelevant)')
  assert(c1 !== c3, 'different values → different reference')
  assert(canon.canonicalize({ x: { y: { z: 42 } } }) === canon.canonicalize({ x: { y: { z: 42 } } }), 'deep nested dedup')
  // Identity cache fast path: same object → instant
  assert(canon.canonicalize(obj1) === c1, 'WeakMap identity cache hit')
  const cs = canon.debugStats()
  console.log(`  ✓ structural dedup: ${cs.lookups} lookups, ${cs.identityHits} identity hits, ${cs.structuralHits} structural hits, ${cs.creates} creates`)

  // ── 3. WhereCanonicalizer ──
  console.log('\n── 3. WhereCanonicalizer ───────────────────────────────────')
  const wc = new WhereCanonicalizer()
  // $and with single child → unwrap (from OSDK WhereClauseCanonicalizer)
  const w1 = wc.canonicalize({ $and: [{ wr: { $gt: 0.5 } }] })
  const w2 = wc.canonicalize({ wr: { $gt: 0.5 } })
  assert(JSON.stringify(w1) === JSON.stringify(w2), '$and[1 child] unwrapped')
  // empty $and → {}
  const w3 = wc.canonicalize({ $and: [] })
  assert(Object.keys(w3).length === 0, '$and[] → {}')
  // $eq shorthand (from OSDK: { field: { $eq: val } } → { field: val })
  const w4 = wc.canonicalize({ team: { $eq: 'ORDER' } })
  assert(w4.team === 'ORDER', '$eq shorthand: {team:{$eq:"ORDER"}} → {team:"ORDER"}')
  // key sorting for structural identity
  const w5 = wc.canonicalize({ z: 1, a: 2, m: 3 })
  const w6 = wc.canonicalize({ a: 2, m: 3, z: 1 })
  assert(JSON.stringify(w5) === JSON.stringify(w6), 'key sorting for identity')
  console.log('  ✓ $and unwrap, empty $and, $eq shorthand, key sorting')

  // ── 4. evaluateFilter ──
  console.log('\n── 4. evaluateFilter ───────────────────────────────────────')
  assert(evaluateFilter('$eq', 42, 42, true), '$eq match')
  assert(!evaluateFilter('$eq', 42, 43, true), '$eq mismatch')
  assert(evaluateFilter('$gt', 10, 5, true), '$gt')
  assert(evaluateFilter('$lte', 5, 5, true), '$lte boundary')
  assert(evaluateFilter('$in', 'MID', ['TOP', 'MID', 'BOT'], true), '$in')
  assert(evaluateFilter('$startsWith', 'Yasuo', 'Yas', true), '$startsWith')
  assert(evaluateFilter('$isNull', null, undefined, true), '$isNull null')
  assert(!evaluateFilter('$isNull', 'notNull', undefined, true), '$isNull value')
  // strict vs loose (core OSDK pattern: unknown ops → strict=false, loose=true)
  assert(!evaluateFilter('$unknownOp', 'x', 'y', true), 'unknown op strict → false')
  assert(evaluateFilter('$unknownOp', 'x', 'y', false), 'unknown op loose → true')
  assert(!evaluateFilter('$containsAllTerms', 'x', 'y', true), 'complex op strict → false')
  assert(evaluateFilter('$containsAllTerms', 'x', 'y', false), 'complex op loose → true')
  console.log('  ✓ all filter ops + strict/loose mode')

  // ── 5. objectMatchesWhere ──
  console.log('\n── 5. objectMatchesWhere ───────────────────────────────────')
  const player = { name: 'Yasuo', winRate: 0.55, kda: 3.2, position: 'MID', level: 12 }
  assert(objectMatchesWhere(player, { name: 'Yasuo' }), 'direct equality')
  assert(objectMatchesWhere(player, { winRate: { $gt: 0.5 } }), '$gt predicate')
  assert(objectMatchesWhere(player, { $and: [{ winRate: { $gt: 0.5 } }, { kda: { $gte: 3.0 } }] }), '$and')
  assert(objectMatchesWhere(player, { $or: [{ name: 'Zed' }, { name: 'Yasuo' }] }), '$or')
  assert(objectMatchesWhere(player, { $not: { name: 'Zed' } }), '$not')
  assert(objectMatchesWhere(player, { $and: [{ $or: [{ level: { $gt: 15 } }, { kda: { $gt: 3.0 } }] }, { position: 'MID' }] }), 'nested $and/$or')
  assert(objectMatchesWhere(player, {}), 'empty where → match all')
  assert(!objectMatchesWhere(player, { winRate: { $gt: 0.9 } }), 'negative match')
  // strict vs loose on complex nested
  assert(objectMatchesWhere(player, { name: { $containsAllTerms: 'test' } }, false), 'loose mode passes unknown op')
  assert(!objectMatchesWhere(player, { name: { $containsAllTerms: 'test' } }, true), 'strict mode rejects unknown op')
  console.log('  ✓ eq, $gt, $and, $or, $not, nested, empty, strict/loose')

  // ── 6. InvalidationGraph ──
  console.log('\n── 6. InvalidationGraph ────────────────────────────────────')
  const graph = new InvalidationGraph()
  const log = []
  graph.register({ queryId: 'q1', objectTypes: new Set(['player']), priority: 1, revalidate: () => { log.push('q1') } })
  graph.register({ queryId: 'q2', objectTypes: new Set(['player', 'champion']), priority: 2, revalidate: () => { log.push('q2') } })
  graph.register({ queryId: 'q3', objectTypes: new Set(['champion']), priority: 0, revalidate: () => { log.push('q3') } })
  await graph.invalidateByType('player')
  assert(log.length === 2 && log[0] === 'q1' && log[1] === 'q2', 'player invalidation: q1(pri=1) then q2(pri=2)')
  log.length = 0
  await graph.invalidateByType('champion')
  assert(log.length === 2 && log[0] === 'q3' && log[1] === 'q2', 'champion invalidation: q3(pri=0) then q2(pri=2)')
  console.log(`  ✓ per-type cascade sorted by priority: ${JSON.stringify(graph.getStats())}`)

  // ── 7. CacheKeyRegistry ──
  console.log('\n── 7. CacheKeyRegistry ────────────────────────────────────')
  const reg = new CacheKeyRegistry({ keepAlive: 100 })
  const k1 = reg.get('player', 'SELF', 'analysis')
  const k2 = reg.get('player', 'SELF', 'analysis')
  assert(k1 === k2, 'same args → same key object (reference identity)')
  // OSDK trailing-undefined normalization
  const k3 = reg.get('player', 'SELF', 'analysis', undefined, undefined)
  assert(k1 === k3, 'trailing undefined trimmed → same key')
  assert(k1 !== reg.get('player', 'ENMY', 'analysis'), 'different args → different key')
  reg.retain(k1); reg.release(k1)
  reg.dispose()
  console.log('  ✓ identity dedup, trailing-undefined normalization, retain/release')

  // ── 8. Full game lifecycle ──
  console.log('\n── 8. Game lifecycle ───────────────────────────────────────')
  const store = createReactiveStore({ gcIntervalMs: 0 })
  const pipeline = createIncrementalPipeline(store)
  const advisor = createOptimisticAdvisor(store, pipeline)
  const bridge = createGameBridge(store, pipeline, advisor)

  // Verify store.queryMatches uses real algorithm
  store.write('test:player', { name: 'Yasuo', winRate: 0.55, position: 'MID' })
  assert(store.queryMatches({ name: 'Yasuo', winRate: 0.55 }, { winRate: { $gt: 0.5 } }), 'store.queryMatches uses real evaluateFilter')
  assert(!store.queryMatches({ name: 'Yasuo', winRate: 0.55 }, { winRate: { $gt: 0.9 } }), 'store.queryMatches negative')

  // Verify canonicalizer is wired in
  const ca = store.canonicalizer.canonicalize({ a: 1, b: 2 })
  const cb = store.canonicalizer.canonicalize({ b: 2, a: 1 })
  assert(ca === cb, 'store.canonicalizer returns same ref for structural equality')

  const mkH = (ctx) => ({ ...ctx, advices: [...ctx.advices, { type: ctx.stage, priority: 2, title: ctx.stage, message: '', evidence: [], confidence: 0.75, audience: 'self', __debug_origin: ctx.stage }] })
  pipeline.addStage('enemy_weakness', mkH, { dataKeys: ['player:ENMY-1:analysis'], dependsOnStages: [] })
  pipeline.addStage('self_analysis', mkH, { dataKeys: ['player:SELF:analysis', 'champion:SELF'], dependsOnStages: [] })
  pipeline.addStage('macro_strategy', mkH, { dataKeys: ['game:mode'], dependsOnStages: ['enemy_weakness', 'self_analysis'] })
  pipeline.addStage('kda_trend', mkH, { dataKeys: ['live:gameTime'], dependsOnStages: [] })

  const mockCtx = { stage: '', advices: [], intermediates: {}, playerAnalyses: {}, championSelections: {}, positionAssignments: {}, selfPuuid: 'SELF', allyPuuids: [], enemyPuuids: ['ENMY-1'], gameMode: 'CLASSIC', queueType: 'RANKED', teamComparison: null, currentGamePhase: 'pre-game', profile: null, histogram: { allyAvg: 70, enemyAvg: 65, scoreDiff: 5, allyScoreCount: 5, enemyScoreCount: 5, allyBuckets: [], enemyBuckets: [], allyScoreTotal: 350, enemyScoreTotal: 325, allyPerPlayer: {}, enemyPerPlayer: {}, tierDistribution: { ally: {}, enemy: {} }, latencyMs: 0 }, __debug_stageTimings: {} }

  bridge.onPhaseChange('Lobby')
  const full = pipeline.runFull(mockCtx)
  console.log(`  Lobby: ${full.report.stagesRun} stages, ${full.report.adviceCount} advices`)

  bridge.onPhaseChange('ChampSelect')
  bridge.onPlayerStatsLoaded({ selfPuuid: 'SELF', playerAnalyses: { 'SELF': { wr: 0.52 }, 'ENMY-1': { wr: 0.38 } }, allyPuuids: [], enemyPuuids: ['ENMY-1'], gameMode: 'CLASSIC', queueType: 'RANKED' })
  const hover = advisor.onChampionHover({ puuid: 'SELF', championId: 157, position: 'MID', timestamp: Date.now() })
  console.log(`  Hover: ${hover?.advices?.length ?? 0} optimistic advices`)
  advisor.onChampionLock({ puuid: 'SELF', championId: 157, position: 'MID', confirmed: true, timestamp: Date.now() })

  bridge.onLiveDataSnapshot({ gameTime: 600, players: [{ summonerName: 'P1', championName: 'Yasuo', team: 'ORDER', scores: { kills: 3, deaths: 1, assists: 5, creepScore: 120 }, items: [{ itemID: 3142 }], level: 10 }] })
  const live = pipeline.runIncremental()
  console.log(`  InProgress: run=${live.report.stagesRun} skip=${live.report.stagesSkipped} (dirty: ${live.report.dirtyStages.join(',') || 'none'})`)

  bridge.onPhaseChange('EndOfGame')
  console.log(`  PostGame: phase=${bridge.currentPhase}`)

  debugPrintStoreSnapshot(store)
  bridge.dispose(); pipeline.dispose(); store.dispose()

  console.log(`\n  Total: ${Date.now() - t0}ms`)
  console.log('  All algorithm tests passed ✓')
  console.log('\n╚══════════════════════════════════════════════════════════════╝')
}

if (typeof require !== 'undefined' && require.main === module) { runReactiveDemo() }
