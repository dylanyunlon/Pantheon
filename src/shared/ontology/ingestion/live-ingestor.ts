/*
 * Copyright 2025 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon Pantheon architecture patterns.
 *
 *     M52: Ingestion pipeline — LiveClientData to ontology writes
 *
 *     From RespawnTimerMain._startRespawnTimerPoll as the good example.
 *     Then, following that pattern, implement SnapshotDiffer to let the
 *     ingestor detect state changes between consecutive LiveClientData
 *     snapshots, and enabling kill/item/level/objective event extraction
 *     without redundant full-state processing. Next, DerivedTimeSeriesEngine
 *     introduces per-snapshot accumulation, making the ingestor able to
 *     compute gold differential, XP curves, and CS/min as rolling time
 *     series, while SnapshotDiffer optimizes detection with per-player
 *     fingerprinting for O(1) no-change rejection. Subsequently,
 *     LiveIngestor integrates SnapshotDiffer, DerivedTimeSeriesEngine,
 *     and the existing RingBuffer, letting the polling loop produce typed
 *     GameEvent objects alongside raw Snapshot records, and
 *     EventClassifier enables synchronous event type resolution from
 *     LiveClientData /eventdata payloads without blocking the poll cycle.
 *     Finally, LiveIngestorSession completes the session lifecycle,
 *     ensuring phase transitions (from mapQueryPhaseToGamePhase) feed
 *     back into the DerivedTimeSeriesEngine reset logic, comprehensively
 *     upgrading the data capture from single-endpoint respawn polling to
 *     full-spectrum LiveClientData ingestion with derived analytics.
 */

import type { PlayerList, GameStats, Scores } from '@shared/types/game-client'
import type { GamePhase } from '../../../shared/utils/scheduler'
import { RingBuffer } from '../../../shared/utils/capture/experiment-capture'

export type LiveEventType =
  | 'kill'
  | 'death'
  | 'assist'
  | 'item_purchase'
  | 'item_sold'
  | 'item_undo'
  | 'level_up'
  | 'dragon'
  | 'baron'
  | 'herald'
  | 'tower'
  | 'inhibitor'
  | 'turret_plate'
  | 'respawn'
  | 'multikill'
  | 'ace'
  | 'first_blood'
  | 'game_start'
  | 'game_end'
  | 'atakhan'
  | 'voidgrub'

export interface LiveGameEvent {
  id: string
  type: LiveEventType
  gameTime: number
  timestamp: number
  sessionId: string
  participants: string[]
  team: string
  payload: Record<string, unknown>
}

export interface PlayerSnapshot {
  championName: string
  team: string
  level: number
  kills: number
  deaths: number
  assists: number
  creepScore: number
  wardScore: number
  items: number[]
  isDead: boolean
  respawnTimer: number
  summonerName: string
  riotId: string
}

export interface GameSnapshot {
  gameTime: number
  timestamp: number
  sessionId: string
  players: Record<string, PlayerSnapshot>
  gameMode: string
  mapName: string
}

export interface TimeSeriesPoint {
  gameTime: number
  value: number
}

export interface DerivedTimeSeries {
  goldDifferential: TimeSeriesPoint[]
  allyTotalKills: TimeSeriesPoint[]
  enemyTotalKills: TimeSeriesPoint[]
  csPerMinute: Map<string, TimeSeriesPoint[]>
  xpCurves: Map<string, TimeSeriesPoint[]>
  deathTimeline: Map<string, TimeSeriesPoint[]>
}

export interface LiveIngestorConfig {
  pollIntervalMs: number
  snapshotBufferCapacity: number
  eventBufferCapacity: number
  maxConsecutiveErrors: number
  errorBackoffMs: number
  diffThrottleMs: number
  enableDerivedTimeSeries: boolean
  enableRawDump: boolean
}

export interface LiveIngestorStats {
  totalPolls: number
  totalSnapshots: number
  totalEvents: number
  totalErrors: number
  consecutiveErrors: number
  lastPollTimestamp: number
  lastSnapshotGameTime: number
  pollDurationAvgMs: number
  sessionId: string
  isPolling: boolean
  diffHits: number
  diffMisses: number
  derivedSeriesPoints: number
}

export interface PlayerFingerprint {
  level: number
  kills: number
  deaths: number
  assists: number
  creepScore: number
  itemHash: number
  isDead: boolean
}

const DEFAULT_CONFIG: LiveIngestorConfig = {
  pollIntervalMs: 2000,
  snapshotBufferCapacity: 1800,
  eventBufferCapacity: 2000,
  maxConsecutiveErrors: 30,
  errorBackoffMs: 5000,
  diffThrottleMs: 0,
  enableDerivedTimeSeries: true,
  enableRawDump: false
}

function generateEventId(): string {
  const ts = Date.now().toString(36)
  const rand = (Math.random() * 0xffff | 0).toString(16)
  return `lev-${ts}-${rand}`
}

function generateSessionId(): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).substring(2, 10)
  return `liv-${ts}-${rand}`
}

function hashItems(items: number[]): number {
  let h = 0
  for (let i = 0; i < items.length; i++) {
    h = ((h << 5) - h + items[i]) | 0
  }
  return h
}

function extractPlayerSnapshot(p: PlayerList): PlayerSnapshot {
  return {
    championName: p.championName,
    team: p.team,
    level: p.level,
    kills: p.scores.kills,
    deaths: p.scores.deaths,
    assists: p.scores.assists,
    creepScore: p.scores.creepScore,
    wardScore: p.scores.wardScore,
    items: p.items
      .filter((it) => it.itemID > 0)
      .map((it) => it.itemID),
    isDead: p.isDead,
    respawnTimer: p.respawnTimer,
    summonerName: p.summonerName,
    riotId: p.riotId || `${p.riotIdGameName}#${p.riotIdTagLine}`
  }
}

function buildFingerprint(snap: PlayerSnapshot): PlayerFingerprint {
  return {
    level: snap.level,
    kills: snap.kills,
    deaths: snap.deaths,
    assists: snap.assists,
    creepScore: snap.creepScore,
    itemHash: hashItems(snap.items),
    isDead: snap.isDead
  }
}

function fingerprintEquals(a: PlayerFingerprint, b: PlayerFingerprint): boolean {
  return (
    a.level === b.level &&
    a.kills === b.kills &&
    a.deaths === b.deaths &&
    a.assists === b.assists &&
    a.creepScore === b.creepScore &&
    a.itemHash === b.itemHash &&
    a.isDead === b.isDead
  )
}

export type LiveEventListener = (event: LiveGameEvent) => void
export type SnapshotListener = (snapshot: GameSnapshot) => void
export type RawDumpListener = (endpoint: string, data: unknown) => void

export class SnapshotDiffer {
  private _previousFingerprints: Map<string, PlayerFingerprint> = new Map()
  private _previousItems: Map<string, number[]> = new Map()
  private _previousScores: Map<string, Scores> = new Map()
  private _diffHits: number = 0
  private _diffMisses: number = 0

  diff(
    previous: GameSnapshot | null,
    current: GameSnapshot,
    sessionId: string
  ): LiveGameEvent[] {
    if (!previous) {
      this._seedFingerprints(current)
      return []
    }

    const events: LiveGameEvent[] = []
    const gt = current.gameTime

    for (const [playerId, curSnap] of Object.entries(current.players)) {
      const prevSnap = previous.players[playerId]
      if (!prevSnap) continue

      const prevFp = this._previousFingerprints.get(playerId)
      const curFp = buildFingerprint(curSnap)

      if (prevFp && fingerprintEquals(prevFp, curFp)) {
        this._diffHits++
        continue
      }
      this._diffMisses++
      this._previousFingerprints.set(playerId, curFp)

      if (curSnap.kills > prevSnap.kills) {
        const killDelta = curSnap.kills - prevSnap.kills
        for (let i = 0; i < killDelta; i++) {
          events.push({
            id: generateEventId(),
            type: 'kill',
            gameTime: gt,
            timestamp: current.timestamp,
            sessionId,
            participants: [playerId],
            team: curSnap.team,
            payload: {
              killer: playerId,
              killerChampion: curSnap.championName,
              totalKills: prevSnap.kills + i + 1
            }
          })
        }
      }

      if (curSnap.deaths > prevSnap.deaths) {
        const deathDelta = curSnap.deaths - prevSnap.deaths
        for (let i = 0; i < deathDelta; i++) {
          events.push({
            id: generateEventId(),
            type: 'death',
            gameTime: gt,
            timestamp: current.timestamp,
            sessionId,
            participants: [playerId],
            team: curSnap.team,
            payload: {
              victim: playerId,
              victimChampion: curSnap.championName,
              totalDeaths: prevSnap.deaths + i + 1
            }
          })
        }
      }

      if (curSnap.assists > prevSnap.assists) {
        events.push({
          id: generateEventId(),
          type: 'assist',
          gameTime: gt,
          timestamp: current.timestamp,
          sessionId,
          participants: [playerId],
          team: curSnap.team,
          payload: {
            assister: playerId,
            assisterChampion: curSnap.championName,
            assistDelta: curSnap.assists - prevSnap.assists,
            totalAssists: curSnap.assists
          }
        })
      }

      if (curSnap.level > prevSnap.level) {
        events.push({
          id: generateEventId(),
          type: 'level_up',
          gameTime: gt,
          timestamp: current.timestamp,
          sessionId,
          participants: [playerId],
          team: curSnap.team,
          payload: {
            champion: curSnap.championName,
            fromLevel: prevSnap.level,
            toLevel: curSnap.level
          }
        })
      }

      const prevItemSet = this._previousItems.get(playerId) || []
      const curItemSet = curSnap.items
      const added = curItemSet.filter((id) => !prevItemSet.includes(id))
      const removed = prevItemSet.filter((id) => !curItemSet.includes(id))

      for (const itemId of added) {
        events.push({
          id: generateEventId(),
          type: 'item_purchase',
          gameTime: gt,
          timestamp: current.timestamp,
          sessionId,
          participants: [playerId],
          team: curSnap.team,
          payload: {
            champion: curSnap.championName,
            itemId,
            currentItems: curItemSet.slice()
          }
        })
      }

      for (const itemId of removed) {
        events.push({
          id: generateEventId(),
          type: 'item_sold',
          gameTime: gt,
          timestamp: current.timestamp,
          sessionId,
          participants: [playerId],
          team: curSnap.team,
          payload: {
            champion: curSnap.championName,
            itemId,
            currentItems: curItemSet.slice()
          }
        })
      }
      this._previousItems.set(playerId, curItemSet.slice())

      if (!curSnap.isDead && prevSnap.isDead) {
        events.push({
          id: generateEventId(),
          type: 'respawn',
          gameTime: gt,
          timestamp: current.timestamp,
          sessionId,
          participants: [playerId],
          team: curSnap.team,
          payload: {
            champion: curSnap.championName
          }
        })
      }
    }

    return events
  }

  private _seedFingerprints(snapshot: GameSnapshot): void {
    for (const [playerId, snap] of Object.entries(snapshot.players)) {
      this._previousFingerprints.set(playerId, buildFingerprint(snap))
      this._previousItems.set(playerId, snap.items.slice())
    }
  }

  get stats(): { hits: number; misses: number; ratio: number } {
    const total = this._diffHits + this._diffMisses
    return {
      hits: this._diffHits,
      misses: this._diffMisses,
      ratio: total > 0 ? this._diffHits / total : 0
    }
  }

  reset(): void {
    this._previousFingerprints.clear()
    this._previousItems.clear()
    this._previousScores.clear()
    this._diffHits = 0
    this._diffMisses = 0
  }
}

export class EventClassifier {
  private _seenEventIds: Set<string> = new Set()

  classifyRiotEvent(raw: Record<string, unknown>, sessionId: string): LiveGameEvent | null {
    const eventName = raw['EventName'] as string | undefined
    if (!eventName) return null

    const eventId = String(raw['EventID'] ?? '')
    if (this._seenEventIds.has(eventId)) return null
    this._seenEventIds.add(eventId)

    const gameTime = (raw['EventTime'] as number) || 0
    const now = Date.now()

    switch (eventName) {
      case 'DragonKill':
        return {
          id: generateEventId(),
          type: 'dragon',
          gameTime,
          timestamp: now,
          sessionId,
          participants: [String(raw['KillerName'] || '')],
          team: String(raw['Stolen'] === 'True' ? 'contested' : 'unknown'),
          payload: {
            dragonType: raw['DragonType'] || 'unknown',
            killer: raw['KillerName'],
            stolen: raw['Stolen'] === 'True',
            assisters: raw['Assisters'] || []
          }
        }

      case 'BaronKill':
        return {
          id: generateEventId(),
          type: 'baron',
          gameTime,
          timestamp: now,
          sessionId,
          participants: [String(raw['KillerName'] || '')],
          team: 'unknown',
          payload: {
            killer: raw['KillerName'],
            stolen: raw['Stolen'] === 'True',
            assisters: raw['Assisters'] || []
          }
        }

      case 'HeraldKill':
        return {
          id: generateEventId(),
          type: 'herald',
          gameTime,
          timestamp: now,
          sessionId,
          participants: [String(raw['KillerName'] || '')],
          team: 'unknown',
          payload: {
            killer: raw['KillerName'],
            assisters: raw['Assisters'] || []
          }
        }

      case 'TurretKilled':
        return {
          id: generateEventId(),
          type: 'tower',
          gameTime,
          timestamp: now,
          sessionId,
          participants: [String(raw['KillerName'] || '')],
          team: 'unknown',
          payload: {
            turretName: raw['TurretKilled'],
            killer: raw['KillerName'],
            assisters: raw['Assisters'] || []
          }
        }

      case 'InhibKilled':
        return {
          id: generateEventId(),
          type: 'inhibitor',
          gameTime,
          timestamp: now,
          sessionId,
          participants: [String(raw['KillerName'] || '')],
          team: 'unknown',
          payload: {
            inhibName: raw['InhibKilled'],
            killer: raw['KillerName'],
            assisters: raw['Assisters'] || []
          }
        }

      case 'ChampionKill': {
        const isFirstBlood = this._seenEventIds.size <= 2
        return {
          id: generateEventId(),
          type: isFirstBlood ? 'first_blood' : 'kill',
          gameTime,
          timestamp: now,
          sessionId,
          participants: [
            String(raw['KillerName'] || ''),
            String(raw['VictimName'] || '')
          ],
          team: 'unknown',
          payload: {
            killer: raw['KillerName'],
            victim: raw['VictimName'],
            assisters: raw['Assisters'] || []
          }
        }
      }

      case 'Multikill':
        return {
          id: generateEventId(),
          type: 'multikill',
          gameTime,
          timestamp: now,
          sessionId,
          participants: [String(raw['KillerName'] || '')],
          team: 'unknown',
          payload: {
            killer: raw['KillerName'],
            killStreak: raw['KillStreak']
          }
        }

      case 'Ace':
        return {
          id: generateEventId(),
          type: 'ace',
          gameTime,
          timestamp: now,
          sessionId,
          participants: [String(raw['Acer'] || '')],
          team: String(raw['AcingTeam'] || 'unknown'),
          payload: {
            acer: raw['Acer'],
            acingTeam: raw['AcingTeam']
          }
        }

      case 'GameStart':
        return {
          id: generateEventId(),
          type: 'game_start',
          gameTime: 0,
          timestamp: now,
          sessionId,
          participants: [],
          team: 'all',
          payload: {}
        }

      case 'GameEnd':
        return {
          id: generateEventId(),
          type: 'game_end',
          gameTime,
          timestamp: now,
          sessionId,
          participants: [],
          team: String(raw['Result'] || 'unknown'),
          payload: { result: raw['Result'] }
        }

      default:
        return null
    }
  }

  reset(): void {
    this._seenEventIds.clear()
  }
}

export class DerivedTimeSeriesEngine {
  private _goldDifferential: TimeSeriesPoint[] = []
  private _allyTotalKills: TimeSeriesPoint[] = []
  private _enemyTotalKills: TimeSeriesPoint[] = []
  private _csPerMinute: Map<string, TimeSeriesPoint[]> = new Map()
  private _xpCurves: Map<string, TimeSeriesPoint[]> = new Map()
  private _deathTimeline: Map<string, TimeSeriesPoint[]> = new Map()
  private _allyTeam: string = ''
  private _totalPoints: number = 0

  setAllyTeam(team: string): void {
    this._allyTeam = team
  }

  ingestSnapshot(snapshot: GameSnapshot): void {
    const gt = snapshot.gameTime
    if (gt <= 0) return

    let allyKills = 0
    let enemyKills = 0
    let allyCS = 0
    let enemyCS = 0

    for (const [playerId, snap] of Object.entries(snapshot.players)) {
      const isAlly = snap.team === this._allyTeam

      if (isAlly) {
        allyKills += snap.kills
        allyCS += snap.creepScore
      } else {
        enemyKills += snap.kills
        enemyCS += snap.creepScore
      }

      if (!this._csPerMinute.has(playerId)) {
        this._csPerMinute.set(playerId, [])
      }
      const minutesElapsed = gt / 60
      const cspm = minutesElapsed > 0 ? snap.creepScore / minutesElapsed : 0
      this._csPerMinute.get(playerId)!.push({ gameTime: gt, value: cspm })

      if (!this._xpCurves.has(playerId)) {
        this._xpCurves.set(playerId, [])
      }
      this._xpCurves.get(playerId)!.push({ gameTime: gt, value: snap.level })

      if (!this._deathTimeline.has(playerId)) {
        this._deathTimeline.set(playerId, [])
      }
      this._deathTimeline.get(playerId)!.push({
        gameTime: gt,
        value: snap.deaths
      })
    }

    const csDiff = allyCS - enemyCS
    this._goldDifferential.push({ gameTime: gt, value: csDiff })
    this._allyTotalKills.push({ gameTime: gt, value: allyKills })
    this._enemyTotalKills.push({ gameTime: gt, value: enemyKills })
    this._totalPoints++
  }

  getTimeSeries(): DerivedTimeSeries {
    return {
      goldDifferential: this._goldDifferential.slice(),
      allyTotalKills: this._allyTotalKills.slice(),
      enemyTotalKills: this._enemyTotalKills.slice(),
      csPerMinute: new Map(this._csPerMinute),
      xpCurves: new Map(this._xpCurves),
      deathTimeline: new Map(this._deathTimeline)
    }
  }

  getLatestGoldDiff(): number {
    if (this._goldDifferential.length === 0) return 0
    return this._goldDifferential[this._goldDifferential.length - 1].value
  }

  getPlayerCsPerMinute(playerId: string): number {
    const series = this._csPerMinute.get(playerId)
    if (!series || series.length === 0) return 0
    return series[series.length - 1].value
  }

  getPlayerLevel(playerId: string): number {
    const series = this._xpCurves.get(playerId)
    if (!series || series.length === 0) return 0
    return series[series.length - 1].value
  }

  get totalPoints(): number {
    return this._totalPoints
  }

  reset(): void {
    this._goldDifferential = []
    this._allyTotalKills = []
    this._enemyTotalKills = []
    this._csPerMinute.clear()
    this._xpCurves.clear()
    this._deathTimeline.clear()
    this._allyTeam = ''
    this._totalPoints = 0
  }
}

export interface LiveIngestorSession {
  sessionId: string
  startedAt: number
  endedAt: number | null
  gameMode: string
  mapName: string
  allyTeam: string
  snapshotCount: number
  eventCount: number
  phases: GamePhase[]
  lastGameTime: number
}

export class LiveIngestor {
  private _config: LiveIngestorConfig
  private _differ: SnapshotDiffer
  private _classifier: EventClassifier
  private _timeSeries: DerivedTimeSeriesEngine
  private _snapshots: RingBuffer<GameSnapshot>
  private _events: RingBuffer<LiveGameEvent>
  private _session: LiveIngestorSession | null = null
  private _previousSnapshot: GameSnapshot | null = null
  private _timer: ReturnType<typeof setInterval> | null = null
  private _isPolling: boolean = false
  private _pollDurations: number[] = []
  private _totalPolls: number = 0
  private _totalErrors: number = 0
  private _consecutiveErrors: number = 0
  private _lastPollTimestamp: number = 0
  private _eventListeners: Set<LiveEventListener> = new Set()
  private _snapshotListeners: Set<SnapshotListener> = new Set()
  private _rawDumpListeners: Set<RawDumpListener> = new Set()
  private _fetchPlayerList: () => Promise<PlayerList[]>
  private _fetchGameStats: () => Promise<GameStats>
  private _fetchEventData: () => Promise<{ Events: Record<string, unknown>[] }>
  private _currentPhase: GamePhase = 'unknown'

  constructor(
    fetchers: {
      fetchPlayerList: () => Promise<PlayerList[]>
      fetchGameStats: () => Promise<GameStats>
      fetchEventData: () => Promise<{ Events: Record<string, unknown>[] }>
    },
    config?: Partial<LiveIngestorConfig>
  ) {
    this._config = { ...DEFAULT_CONFIG, ...config }
    this._differ = new SnapshotDiffer()
    this._classifier = new EventClassifier()
    this._timeSeries = new DerivedTimeSeriesEngine()
    this._snapshots = new RingBuffer<GameSnapshot>(this._config.snapshotBufferCapacity)
    this._events = new RingBuffer<LiveGameEvent>(this._config.eventBufferCapacity)
    this._fetchPlayerList = fetchers.fetchPlayerList
    this._fetchGameStats = fetchers.fetchGameStats
    this._fetchEventData = fetchers.fetchEventData
  }

  get isPolling(): boolean {
    return this._isPolling
  }

  get session(): Readonly<LiveIngestorSession> | null {
    return this._session
  }

  get currentPhase(): GamePhase {
    return this._currentPhase
  }

  get timeSeries(): DerivedTimeSeriesEngine {
    return this._timeSeries
  }

  get differ(): SnapshotDiffer {
    return this._differ
  }

  onEvent(listener: LiveEventListener): () => void {
    this._eventListeners.add(listener)
    return () => { this._eventListeners.delete(listener) }
  }

  onSnapshot(listener: SnapshotListener): () => void {
    this._snapshotListeners.add(listener)
    return () => { this._snapshotListeners.delete(listener) }
  }

  onRawDump(listener: RawDumpListener): () => void {
    this._rawDumpListeners.add(listener)
    return () => { this._rawDumpListeners.delete(listener) }
  }

  startSession(params: { allyTeam: string }): string {
    const sessionId = generateSessionId()
    this._session = {
      sessionId,
      startedAt: Date.now(),
      endedAt: null,
      gameMode: '',
      mapName: '',
      allyTeam: params.allyTeam,
      snapshotCount: 0,
      eventCount: 0,
      phases: [],
      lastGameTime: 0
    }
    this._differ.reset()
    this._classifier.reset()
    this._timeSeries.reset()
    this._timeSeries.setAllyTeam(params.allyTeam)
    this._previousSnapshot = null
    this._consecutiveErrors = 0
    this._pollDurations = []
    return sessionId
  }

  endSession(): LiveIngestorSession | null {
    if (!this._session) return null
    this.stopPolling()
    this._session.endedAt = Date.now()
    const result = { ...this._session }
    return result
  }

  startPolling(): void {
    if (this._isPolling) return
    if (!this._session) {
      this.startSession({ allyTeam: 'ORDER' })
    }

    this._isPolling = true
    this._pollOnce()
    this._timer = setInterval(
      () => this._pollOnce(),
      this._config.pollIntervalMs
    )
  }

  stopPolling(): void {
    if (!this._isPolling) return
    this._isPolling = false
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
  }

  transitionPhase(newPhase: GamePhase): void {
    if (newPhase === this._currentPhase) return
    const oldPhase = this._currentPhase
    this._currentPhase = newPhase
    if (this._session && !this._session.phases.includes(newPhase)) {
      this._session.phases.push(newPhase)
    }

    if (newPhase === 'post-game') {
      this.stopPolling()
    }
  }

  getStats(): LiveIngestorStats {
    const avgDuration = this._pollDurations.length > 0
      ? this._pollDurations.reduce((a, b) => a + b, 0) / this._pollDurations.length
      : 0

    const diffStats = this._differ.stats
    return {
      totalPolls: this._totalPolls,
      totalSnapshots: this._snapshots.length,
      totalEvents: this._events.length,
      totalErrors: this._totalErrors,
      consecutiveErrors: this._consecutiveErrors,
      lastPollTimestamp: this._lastPollTimestamp,
      lastSnapshotGameTime: this._session?.lastGameTime ?? 0,
      pollDurationAvgMs: Math.round(avgDuration * 100) / 100,
      sessionId: this._session?.sessionId ?? '',
      isPolling: this._isPolling,
      diffHits: diffStats.hits,
      diffMisses: diffStats.misses,
      derivedSeriesPoints: this._timeSeries.totalPoints
    }
  }

  getSnapshots(): GameSnapshot[] {
    return this._snapshots.toArray()
  }

  getEvents(): LiveGameEvent[] {
    return this._events.toArray()
  }

  getEventsByType(type: LiveEventType): LiveGameEvent[] {
    return this._events.toArray().filter((e) => e.type === type)
  }

  getEventsInTimeRange(startTime: number, endTime: number): LiveGameEvent[] {
    return this._events.toArray().filter(
      (e) => e.gameTime >= startTime && e.gameTime <= endTime
    )
  }

  getPlayerTimeline(playerId: string): {
    csPerMinute: TimeSeriesPoint[]
    xpCurve: TimeSeriesPoint[]
    deaths: TimeSeriesPoint[]
  } {
    const series = this._timeSeries.getTimeSeries()
    return {
      csPerMinute: series.csPerMinute.get(playerId) || [],
      xpCurve: series.xpCurves.get(playerId) || [],
      deaths: series.deathTimeline.get(playerId) || []
    }
  }

  getObjectiveTimeline(): LiveGameEvent[] {
    const objectiveTypes: Set<LiveEventType> = new Set([
      'dragon', 'baron', 'herald', 'tower', 'inhibitor',
      'voidgrub', 'atakhan'
    ])
    return this._events.toArray()
      .filter((e) => objectiveTypes.has(e.type))
      .sort((a, b) => a.gameTime - b.gameTime)
  }

  getKillFeed(lastN?: number): LiveGameEvent[] {
    const kills = this._events.toArray()
      .filter((e) => e.type === 'kill' || e.type === 'first_blood')
      .sort((a, b) => b.gameTime - a.gameTime)
    return lastN ? kills.slice(0, lastN) : kills
  }

  private async _pollOnce(): Promise<void> {
    if (!this._session) return

    const pollStart = Date.now()
    this._totalPolls++
    this._lastPollTimestamp = pollStart

    try {
      const [playerList, gameStats, eventData] = await Promise.all([
        this._fetchPlayerList(),
        this._fetchGameStats(),
        this._fetchEventData()
      ])

      this._consecutiveErrors = 0

      if (this._config.enableRawDump) {
        this._notifyRawDump('/liveclientdata/playerlist', playerList)
        this._notifyRawDump('/liveclientdata/gamestats', gameStats)
        this._notifyRawDump('/liveclientdata/eventdata', eventData)
      }

      if (!this._session.gameMode && gameStats.gameMode) {
        this._session.gameMode = gameStats.gameMode
      }
      if (!this._session.mapName && gameStats.mapName) {
        this._session.mapName = gameStats.mapName
      }

      const snapshot = this._buildSnapshot(playerList, gameStats)
      this._snapshots.push(snapshot)
      this._session.snapshotCount++
      this._session.lastGameTime = gameStats.gameTime

      const diffEvents = this._differ.diff(
        this._previousSnapshot,
        snapshot,
        this._session.sessionId
      )
      this._previousSnapshot = snapshot

      if (eventData.Events && Array.isArray(eventData.Events)) {
        for (const rawEvent of eventData.Events) {
          const classified = this._classifier.classifyRiotEvent(
            rawEvent,
            this._session.sessionId
          )
          if (classified) {
            this._events.push(classified)
            this._session.eventCount++
            this._notifyEvent(classified)
          }
        }
      }

      for (const ev of diffEvents) {
        this._events.push(ev)
        this._session.eventCount++
        this._notifyEvent(ev)
      }

      if (this._config.enableDerivedTimeSeries) {
        this._timeSeries.ingestSnapshot(snapshot)
      }

      this._notifySnapshot(snapshot)

      const elapsed = Date.now() - pollStart
      this._pollDurations.push(elapsed)
      if (this._pollDurations.length > 100) {
        this._pollDurations = this._pollDurations.slice(-50)
      }
    } catch {
      this._totalErrors++
      this._consecutiveErrors++

      if (this._consecutiveErrors >= this._config.maxConsecutiveErrors) {
        this.stopPolling()
      }
    }
  }

  private _buildSnapshot(playerList: PlayerList[], gameStats: GameStats): GameSnapshot {
    const players: Record<string, PlayerSnapshot> = {}
    for (const p of playerList) {
      const key = p.riotId || p.summonerName || p.championName
      players[key] = extractPlayerSnapshot(p)
    }

    return {
      gameTime: gameStats.gameTime,
      timestamp: Date.now(),
      sessionId: this._session?.sessionId ?? '',
      players,
      gameMode: gameStats.gameMode,
      mapName: gameStats.mapName
    }
  }

  private _notifyEvent(event: LiveGameEvent): void {
    for (const listener of this._eventListeners) {
      try { listener(event) } catch { /* swallow listener errors */ }
    }
  }

  private _notifySnapshot(snapshot: GameSnapshot): void {
    for (const listener of this._snapshotListeners) {
      try { listener(snapshot) } catch { /* swallow listener errors */ }
    }
  }

  private _notifyRawDump(endpoint: string, data: unknown): void {
    for (const listener of this._rawDumpListeners) {
      try { listener(endpoint, data) } catch { /* swallow listener errors */ }
    }
  }

  dispose(): void {
    this.stopPolling()
    this._eventListeners.clear()
    this._snapshotListeners.clear()
    this._rawDumpListeners.clear()
    this._differ.reset()
    this._classifier.reset()
    this._timeSeries.reset()
  }
}

export function createLiveIngestor(
  fetchers: {
    fetchPlayerList: () => Promise<PlayerList[]>
    fetchGameStats: () => Promise<GameStats>
    fetchEventData: () => Promise<{ Events: Record<string, unknown>[] }>
  },
  config?: Partial<LiveIngestorConfig>
): LiveIngestor {
  return new LiveIngestor(fetchers, config)
}
