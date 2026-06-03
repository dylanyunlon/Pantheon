// @ts-nocheck
/**
 * run-reactive.ts — end-to-end simulation of a full game lifecycle
 *
 * Simulates: Lobby → ChampSelect (hover/lock) → Loading → InProgress
 * (live data snapshots) → PostGame — all through the reactive system.
 *
 * Usage: npx tsx src/reactive/run-reactive.ts
 */

import { NexusIntrospector } from '../debug/introspector'
import { createReactiveStore, debugPrintStoreSnapshot } from './store'
import { createIncrementalPipeline, debugPrintIncrementalReport } from './incremental-pipeline'
import { createOptimisticAdvisor } from './optimistic-advisor'
import { createGameBridge, debugPrintBridgeState, mapGameflowPhase } from './game-bridge'

function rand(a: number, b: number) { return a + Math.random() * (b - a) }

export function runReactiveDemo(): void {
  const intro = NexusIntrospector.getInstance()
  const t0 = Date.now()

  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║     REACTIVE GAME LIFECYCLE — Full Simulation              ║')
  console.log('║     ' + new Date().toISOString().padEnd(56) + '║')
  console.log('╠══════════════════════════════════════════════════════════════╣')

  const store = createReactiveStore({ gcIntervalMs: 0 })
  const pipeline = createIncrementalPipeline(store)
  const advisor = createOptimisticAdvisor(store, pipeline)
  const bridge = createGameBridge(store, pipeline, advisor)

  // Register mock stages with realistic dependencies
  const mkHandler = (ctx: any) => {
    const a = { type: ctx.stage, priority: 2, title: `${ctx.stage}`, message: '', evidence: [], confidence: 0.75, audience: 'self', __debug_origin: ctx.stage }
    return { ...ctx, advices: [...ctx.advices, a] }
  }
  pipeline.addStage('enemy_weakness', mkHandler, { dataKeys: ['player:ENMY-1:analysis', 'player:ENMY-2:analysis'], dependsOnStages: [] })
  pipeline.addStage('self_analysis', mkHandler, { dataKeys: ['player:SELF:analysis', 'champion:SELF'], dependsOnStages: [] })
  pipeline.addStage('macro_strategy', mkHandler, { dataKeys: ['game:mode', 'game:allyPuuids', 'game:enemyPuuids'], dependsOnStages: ['enemy_weakness', 'self_analysis'] })
  pipeline.addStage('lane_matchup', mkHandler, { dataKeys: ['champion:SELF', 'champion:ENMY-1', 'position:SELF'], dependsOnStages: ['self_analysis'] })
  pipeline.addStage('kda_trend', mkHandler, { dataKeys: ['live:gameTime', 'live:player:Player1'], dependsOnStages: [] })

  // Bootstrap with full context
  const mockCtx: any = {
    stage: '__init__', advices: [], intermediates: {}, playerAnalyses: {},
    championSelections: {}, positionAssignments: {},
    selfPuuid: 'SELF', allyPuuids: ['ALLY-1', 'ALLY-2', 'ALLY-3', 'ALLY-4'],
    enemyPuuids: ['ENMY-1', 'ENMY-2', 'ENMY-3', 'ENMY-4', 'ENMY-5'],
    gameMode: 'CLASSIC', queueType: 'RANKED', teamComparison: null,
    currentGamePhase: 'pre-game', profile: null,
    histogram: { allyAvg: 70, enemyAvg: 65, scoreDiff: 5, allyScoreCount: 5, enemyScoreCount: 5, allyBuckets: [], enemyBuckets: [], allyScoreTotal: 350, enemyScoreTotal: 325, allyPerPlayer: {}, enemyPerPlayer: {}, tierDistribution: { ally: {}, enemy: {} }, latencyMs: 0 },
    __debug_stageTimings: {}
  }

  // ── Phase 1: Lobby ──
  console.log('\n── Phase 1: Lobby ──────────────────────────────────────────')
  bridge.onPhaseChange('Lobby')
  console.log(`  Phase: ${bridge.currentPhase}`)

  // Run initial full pipeline
  const full = pipeline.runFull(mockCtx)
  console.log(`  Full pipeline: ${full.report.stagesRun} stages, ${full.report.totalMs}ms, ${full.report.adviceCount} advices`)

  // ── Phase 2: ChampSelect ──
  console.log('\n── Phase 2: ChampSelect ────────────────────────────────────')
  bridge.onPhaseChange('ChampSelect')

  // Load player data
  bridge.onPlayerStatsLoaded({
    selfPuuid: 'SELF',
    playerAnalyses: {
      'SELF': { summary: { winRate: 0.52, averageKda: 3.2, count: 34 } },
      'ENMY-1': { summary: { winRate: 0.38, averageKda: 1.4, count: 19 } },
      'ENMY-2': { summary: { winRate: 0.55, averageKda: 2.8, count: 28 } }
    },
    allyPuuids: ['ALLY-1', 'ALLY-2', 'ALLY-3', 'ALLY-4'],
    enemyPuuids: ['ENMY-1', 'ENMY-2', 'ENMY-3', 'ENMY-4', 'ENMY-5'],
    gameMode: 'CLASSIC', queueType: 'RANKED'
  })
  console.log('  Player data loaded')

  // Hover champion (optimistic prediction)
  console.log('  Hovering Yasuo (157)...')
  const hoverResult = advisor.onChampionHover({ puuid: 'SELF', championId: 157, position: 'MID', timestamp: Date.now() })
  if (hoverResult) {
    console.log(`  → ${hoverResult.advices.length} optimistic advices (isOptimistic=${hoverResult.isOptimistic})`)
  }

  // Switch hover
  console.log('  Switching to Zed (238)...')
  // need delay > debounce
  const hover2 = advisor.onChampionHover({ puuid: 'SELF', championId: 238, position: 'MID', timestamp: Date.now() + 200 })

  // Lock champion
  console.log('  Locking Zed...')
  bridge.onChampionLock('SELF', 238, 'MID', true)
  const champEntry = store.read('champion:SELF')
  console.log(`  Confirmed: champion=${champEntry?.value} optimistic=${champEntry?.isOptimistic}`)

  // ── Phase 3: Loading ──
  console.log('\n── Phase 3: Loading ────────────────────────────────────────')
  bridge.onPhaseChange('GameStart')
  console.log(`  Phase: ${bridge.currentPhase}`)
  const loadIncr = pipeline.runIncremental()
  console.log(`  Incremental: run=${loadIncr.report.stagesRun} skip=${loadIncr.report.stagesSkipped}`)

  // ── Phase 4: InProgress ──
  console.log('\n── Phase 4: InProgress (live data) ─────────────────────────')

  // Simulate 3 live snapshots at different game times
  const gameTimes = [120, 600, 1200]
  for (const gt of gameTimes) {
    bridge.onLiveDataSnapshot({
      gameTime: gt,
      players: [
        { summonerName: 'Player1', championName: 'Zed', team: 'ORDER', scores: { kills: Math.floor(gt / 200), deaths: Math.floor(gt / 400), assists: Math.floor(gt / 300), creepScore: Math.floor(gt * 0.12) }, items: [{ itemID: 3142 }], level: Math.min(18, Math.floor(gt / 70) + 1) },
        { summonerName: 'Enemy1', championName: 'Ahri', team: 'CHAOS', scores: { kills: Math.floor(gt / 300), deaths: Math.floor(gt / 250), assists: Math.floor(gt / 350), creepScore: Math.floor(gt * 0.10) }, items: [{ itemID: 3285 }], level: Math.min(18, Math.floor(gt / 75) + 1) }
      ]
    })
    const phase = mapGameflowPhase('InProgress', gt)
    console.log(`  t=${gt}s phase=${phase} → incremental...`)
    const snap = pipeline.runIncremental()
    console.log(`    run=${snap.report.stagesRun} skip=${snap.report.stagesSkipped} (dirty: ${snap.report.dirtyStages.join(',') || 'none'})`)
  }

  // ── Phase 5: PostGame ──
  console.log('\n── Phase 5: PostGame ───────────────────────────────────────')
  bridge.onPhaseChange('EndOfGame')
  console.log(`  Phase: ${bridge.currentPhase}`)

  // ── Summary ──
  console.log('\n── Summary ─────────────────────────────────────────────────')
  debugPrintStoreSnapshot(store)
  debugPrintBridgeState(bridge)

  const checkpoints = intro.getCheckpoints()
  console.log(`  Introspector: ${intro.getEvents({}).length} events, ${checkpoints.length} checkpoints`)
  for (const cp of checkpoints.slice(-6)) {
    console.log(`    ${new Date(cp.timestamp).toISOString().slice(11, 23)} ${cp.message}`)
  }

  bridge.dispose()
  pipeline.dispose()
  store.dispose()

  console.log(`\n  Total: ${Date.now() - t0}ms`)
  console.log('\n╚══════════════════════════════════════════════════════════════╝')
}

if (typeof require !== 'undefined' && require.main === module) { runReactiveDemo() }
