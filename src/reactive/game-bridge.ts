// @ts-nocheck
/**
 * GameBridge — connects reactive store to upstream game data flow
 *
 * M89-M91: Maps upstream MobX state → ReactiveStore keys:
 *   GameflowPhase     → store.write('game:phase', ...)
 *   ChampSelect       → OptimisticAdvisor.onChampionHover/Lock
 *   LiveClientData    → store.batch(player snapshots)
 *   PlayerStats       → store.batch(analysis data)
 *
 * This is the integration layer between the existing shard system
 * (MobX observable, LCU WebSocket) and the new reactive engine.
 */

import type { GamePhase } from '../types'
import { ReactiveStore, NexusBatchContext } from './store'
import { IncrementalPipeline } from './incremental-pipeline'
import { OptimisticAdvisor, ChampionHoverEvent, ChampionLockEvent } from './optimistic-advisor'
import { introspector } from '../debug/introspector'
const MODULE = 'game-bridge'

// ── Phase mapping (upstream GameflowPhase → engine GamePhase) ──

const PHASE_MAP: Record<string, GamePhase> = {
  'None': 'pre-game',
  'Lobby': 'pre-game',
  'Matchmaking': 'pre-game',
  'ReadyCheck': 'pre-game',
  'ChampSelect': 'champ-select',
  'GameStart': 'loading',
  'InProgress': 'early-game',      // refined by game time
  'Reconnect': 'reconnecting',
  'WaitingForStats': 'post-game',
  'PreEndOfGame': 'post-game',
  'EndOfGame': 'post-game',
  'WatchInProgress': 'unknown',
  'TerminatedInError': 'unknown'
}

export function mapGameflowPhase(upstream: string, gameTimeSeconds?: number): GamePhase {
  if (upstream === 'InProgress' && gameTimeSeconds !== undefined) {
    if (gameTimeSeconds < 900) return 'early-game'
    if (gameTimeSeconds < 1800) return 'mid-game'
    return 'late-game'
  }
  return PHASE_MAP[upstream] ?? 'unknown'
}

// ── GameBridge ──

export interface GameBridgeConfig {
  /** How often to poll LiveClientData during InProgress (ms) */
  liveDataPollMs: number
  /** Enable optimistic predictions during ChampSelect */
  enableOptimisticPredictions: boolean
  /** Minimum data completeness to trigger pipeline (0-1) */
  minDataCompletenessRatio: number
}

const DEFAULT_CFG: GameBridgeConfig = {
  liveDataPollMs: 3000,
  enableOptimisticPredictions: true,
  minDataCompletenessRatio: 0.3
}

export class GameBridge {
  private _store: ReactiveStore
  private _pipeline: IncrementalPipeline
  private _advisor: OptimisticAdvisor
  private _cfg: GameBridgeConfig
  private _currentPhase: GamePhase = 'unknown'
  private _selfPuuid: string | null = null
  private _stats = {
    phaseTransitions: 0, champSelectEvents: 0,
    liveDataUpdates: 0, playerDataBatches: 0,
    totalBridgeMs: 0
  }

  constructor(
    store: ReactiveStore,
    pipeline: IncrementalPipeline,
    advisor: OptimisticAdvisor,
    cfg?: Partial<GameBridgeConfig>
  ) {
    this._store = store
    this._pipeline = pipeline
    this._advisor = advisor
    this._cfg = { ...DEFAULT_CFG, ...cfg }

    introspector.registerProbe(MODULE, 'bridge', () => ({
      phase: this._currentPhase,
      selfPuuid: this._selfPuuid?.slice(0, 8) ?? null,
      ...this._stats
    }))
  }

  // ── Phase transitions (from gameflow shard) ──

  onPhaseChange(upstreamPhase: string, gameTimeSeconds?: number): void {
    const newPhase = mapGameflowPhase(upstreamPhase, gameTimeSeconds)
    if (newPhase === this._currentPhase) return

    const oldPhase = this._currentPhase
    this._currentPhase = newPhase
    this._stats.phaseTransitions++

    this._store.batch((ctx) => {
      ctx.write('game:phase', newPhase, 'loaded')
      ctx.write('game:phase:previous', oldPhase, 'loaded')
      ctx.write('game:phase:timestamp', Date.now(), 'loaded')
    })

    introspector.info(MODULE, `Phase: ${oldPhase} → ${newPhase}`, {
      upstream: upstreamPhase,
      gameTime: gameTimeSeconds
    })
  }

  // ── ChampSelect events (from champ-select shard) ──

  onChampionHover(puuid: string, championId: number, position: string): void {
    if (!this._cfg.enableOptimisticPredictions) return
    this._stats.champSelectEvents++
    this._advisor.onChampionHover({
      puuid, championId, position, timestamp: Date.now()
    })
  }

  onChampionLock(puuid: string, championId: number, position: string, confirmed: boolean): void {
    this._stats.champSelectEvents++
    this._advisor.onChampionLock({
      puuid, championId, position, confirmed, timestamp: Date.now()
    })
  }

  // ── Bulk champion selections (from ongoing-game shard) ──

  onChampionSelectionsUpdate(selections: Record<string, number>): void {
    this._store.batch((ctx) => {
      for (const [puuid, champId] of Object.entries(selections)) {
        ctx.write(`champion:${puuid}`, champId, 'loaded')
      }
    })
  }

  // ── Player data batch (from ongoing-game shard) ──

  onPlayerStatsLoaded(params: {
    selfPuuid: string
    playerAnalyses: Record<string, any>
    rankedStats?: Record<string, any>
    positionAssignments?: Record<string, any>
    championSelections?: Record<string, number>
    allyPuuids: string[]
    enemyPuuids: string[]
    gameMode: string
    queueType: string
  }): void {
    const t0 = Date.now()
    this._selfPuuid = params.selfPuuid
    this._stats.playerDataBatches++

    this._store.batch((ctx) => {
      ctx.write('game:selfPuuid', params.selfPuuid, 'loaded')
      ctx.write('game:allyPuuids', params.allyPuuids, 'loaded')
      ctx.write('game:enemyPuuids', params.enemyPuuids, 'loaded')
      ctx.write('game:mode', params.gameMode, 'loaded')
      ctx.write('game:queueType', params.queueType, 'loaded')

      for (const [puuid, analysis] of Object.entries(params.playerAnalyses)) {
        ctx.write(`player:${puuid}:analysis`, analysis, 'loaded')
      }
      if (params.rankedStats) {
        for (const [puuid, ranked] of Object.entries(params.rankedStats)) {
          ctx.write(`player:${puuid}:ranked`, ranked, 'loaded')
        }
      }
      if (params.positionAssignments) {
        for (const [puuid, pos] of Object.entries(params.positionAssignments)) {
          ctx.write(`position:${puuid}`, pos, 'loaded')
        }
      }
      if (params.championSelections) {
        for (const [puuid, champId] of Object.entries(params.championSelections)) {
          ctx.write(`champion:${puuid}`, champId, 'loaded')
        }
      }
    })

    this._stats.totalBridgeMs += Date.now() - t0
    introspector.checkpoint(MODULE, 'player_data_batch', {
      players: Object.keys(params.playerAnalyses).length,
      ms: Date.now() - t0
    })
  }

  // ── LiveClientData snapshot (from game-client shard during InProgress) ──

  onLiveDataSnapshot(snapshot: {
    gameTime: number
    players: Array<{
      summonerName: string
      championName: string
      team: string
      scores: { kills: number; deaths: number; assists: number; creepScore: number }
      items: Array<{ itemID: number }>
      level: number
      position?: { x: number; y: number }
    }>
  }): void {
    this._stats.liveDataUpdates++

    // Refine game phase based on actual game time
    this.onPhaseChange('InProgress', snapshot.gameTime)

    this._store.batch((ctx) => {
      ctx.write('live:gameTime', snapshot.gameTime, 'loaded')
      ctx.write('live:snapshot', snapshot, 'loaded')
      ctx.write('live:lastUpdate', Date.now(), 'loaded')

      for (const player of snapshot.players) {
        const key = `live:player:${player.summonerName}`
        ctx.write(key, {
          champion: player.championName,
          team: player.team,
          kda: player.scores,
          items: player.items.map(i => i.itemID),
          level: player.level,
          position: player.position
        }, 'loaded')
      }
    })
  }

  // ── Premade team detection results ──

  onPremadeTeamsDetected(teams: Record<string, string[][]>): void {
    this._store.write('game:premadeTeams', teams, 'loaded')
  }

  // ── Accessor ──

  get currentPhase() { return this._currentPhase }
  get selfPuuid() { return this._selfPuuid }
  getStats() { return { ...this._stats } }

  dispose(): void {
    this._advisor.dispose()
    introspector.info(MODULE, 'GameBridge disposed', this._stats)
  }
}

// ── Debug ──

export function debugPrintBridgeState(bridge: GameBridge): void {
  const s = bridge.getStats()
  console.log(`\n── GameBridge ──`)
  console.log(`  Phase: ${bridge.currentPhase} | Self: ${bridge.selfPuuid?.slice(0, 8) ?? '?'}`)
  console.log(`  Transitions: ${s.phaseTransitions} | ChampSelect: ${s.champSelectEvents}`)
  console.log(`  LiveData: ${s.liveDataUpdates} | PlayerBatches: ${s.playerDataBatches}`)
  console.log(`  Bridge latency: ${s.totalBridgeMs}ms total`)
  console.log('─'.repeat(40))
}

export function createGameBridge(
  store: ReactiveStore, pipeline: IncrementalPipeline,
  advisor: OptimisticAdvisor, cfg?: Partial<GameBridgeConfig>
) { return new GameBridge(store, pipeline, advisor, cfg) }
