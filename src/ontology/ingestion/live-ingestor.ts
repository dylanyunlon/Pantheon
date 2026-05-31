// @ts-nocheck
/**
 * NexusLiveIngestor — LiveClientData to ontology event extraction
 *
 * Algorithmic changes from Pantheon LiveIngestor:
 *   1. SnapshotDiffer uses FNV-1a composite fingerprint instead of
 *      field-by-field comparison (faster O(1) rejection)
 *   2. EventClassifier tracks event frequency for burst detection
 *   3. DerivedTimeSeriesEngine uses EWMA smoothing for csPerMinute
 *   4. LiveIngestor uses adaptive poll interval — backs off when idle
 *   5. New event types: 'grub_spawn', 'soul_point'
 *   6. Kill event enrichment: tracks multikill streaks per player
 *
 * Debug instrumentation:
 *   - introspector probes for poll cycle, diff stats, event buffer
 *   - debugPrintIngestorStats() for formatted output
 */

import { NexusIntrospector } from '../../debug/introspector'

const introspector = NexusIntrospector.getInstance()

// ── Types ────────────────────────────────────────────────────────────

export type LiveEventType =
  | 'kill' | 'death' | 'assist'
  | 'item_purchase' | 'item_sold' | 'item_undo'
  | 'level_up' | 'dragon' | 'baron' | 'herald'
  | 'tower' | 'inhibitor' | 'turret_plate'
  | 'respawn' | 'multikill' | 'ace'
  | 'first_blood' | 'game_start' | 'game_end'
  | 'atakhan' | 'voidgrub'
  | 'grub_spawn' | 'soul_point'     // NEW

export interface LiveGameEvent {
  id: string
  type: LiveEventType
  gameTime: number
  timestamp: number
  sessionId: string
  participants: string[]
  team: string
  payload: Record<string, unknown>
  __debug_source?: string
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
  enableDerivedTimeSeries: boolean
  adaptivePollEnabled: boolean
  adaptivePollMaxMs: number
  ewmaAlpha: number
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
  currentPollIntervalMs: number
}

type GamePhase = 'unknown' | 'pre-game' | 'loading' | 'in-game' | 'post-game'

const DEFAULT_CONFIG: LiveIngestorConfig = {
  pollIntervalMs: 2000,
  snapshotBufferCapacity: 1800,
  eventBufferCapacity: 2000,
  maxConsecutiveErrors: 30,
  errorBackoffMs: 5000,
  enableDerivedTimeSeries: true,
  adaptivePollEnabled: true,
  adaptivePollMaxMs: 8000,
  ewmaAlpha: 0.3
}

function generateEventId(): string {
  return `nev-${Date.now().toString(36)}-${(Math.random() * 0xffff | 0).toString(16)}`
}

function generateSessionId(): string {
  return `nlv-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 10)}`
}

// Changed: FNV-1a composite fingerprint
function computeCompositeHash(snap: PlayerSnapshot): number {
  let h = 0x811c9dc5
  h = Math.imul(h ^ snap.level, 0x01000193)
  h = Math.imul(h ^ snap.kills, 0x01000193)
  h = Math.imul(h ^ snap.deaths, 0x01000193)
  h = Math.imul(h ^ snap.assists, 0x01000193)
  h = Math.imul(h ^ snap.creepScore, 0x01000193)
  h = Math.imul(h ^ (snap.isDead ? 1 : 0), 0x01000193)
  for (const item of snap.items) h = Math.imul(h ^ item, 0x01000193)
  return h >>> 0
}

// ── RingBuffer (standalone) ──────────────────────────────────────────

class RingBuffer<T> {
  private _buf: T[] = []
  private _cap: number
  private _head: number = 0
  private _count: number = 0

  constructor(cap: number) { this._cap = cap; this._buf = new Array(cap) }

  push(item: T): void {
    this._buf[this._head] = item
    this._head = (this._head + 1) % this._cap
    if (this._count < this._cap) this._count++
  }

  toArray(): T[] {
    if (this._count < this._cap) return this._buf.slice(0, this._count)
    return [...this._buf.slice(this._head), ...this._buf.slice(0, this._head)]
  }

  get length(): number { return this._count }
}

// ── SnapshotDiffer ───────────────────────────────────────────────────

export class SnapshotDiffer {
  private _prevHashes: Map<string, number> = new Map()
  private _prevItems: Map<string, number[]> = new Map()
  private _diffHits: number = 0
  private _diffMisses: number = 0
  private _killStreaks: Map<string, number> = new Map()

  diff(prev: GameSnapshot | null, cur: GameSnapshot, sessionId: string): LiveGameEvent[] {
    if (!prev) { this._seed(cur); return [] }

    const events: LiveGameEvent[] = []
    const gt = cur.gameTime

    for (const [pid, snap] of Object.entries(cur.players)) {
      const prevSnap = prev.players[pid]
      if (!prevSnap) continue

      const prevH = this._prevHashes.get(pid)
      const curH = computeCompositeHash(snap)
      if (prevH === curH) { this._diffHits++; continue }
      this._diffMisses++
      this._prevHashes.set(pid, curH)

      if (snap.kills > prevSnap.kills) {
        const delta = snap.kills - prevSnap.kills
        const streak = (this._killStreaks.get(pid) || 0) + delta
        this._killStreaks.set(pid, streak)
        for (let i = 0; i < delta; i++) {
          events.push({ id: generateEventId(), type: 'kill', gameTime: gt, timestamp: cur.timestamp, sessionId,
            participants: [pid], team: snap.team,
            payload: { killer: pid, killerChampion: snap.championName, totalKills: prevSnap.kills + i + 1, currentStreak: streak },
            __debug_source: 'differ' })
        }
      }

      if (snap.deaths > prevSnap.deaths) {
        this._killStreaks.set(pid, 0)
        for (let i = 0; i < snap.deaths - prevSnap.deaths; i++) {
          events.push({ id: generateEventId(), type: 'death', gameTime: gt, timestamp: cur.timestamp, sessionId,
            participants: [pid], team: snap.team,
            payload: { victim: pid, victimChampion: snap.championName, totalDeaths: prevSnap.deaths + i + 1 },
            __debug_source: 'differ' })
        }
      }

      if (snap.assists > prevSnap.assists) {
        events.push({ id: generateEventId(), type: 'assist', gameTime: gt, timestamp: cur.timestamp, sessionId,
          participants: [pid], team: snap.team,
          payload: { assister: pid, assistDelta: snap.assists - prevSnap.assists, totalAssists: snap.assists },
          __debug_source: 'differ' })
      }

      if (snap.level > prevSnap.level) {
        events.push({ id: generateEventId(), type: 'level_up', gameTime: gt, timestamp: cur.timestamp, sessionId,
          participants: [pid], team: snap.team,
          payload: { champion: snap.championName, fromLevel: prevSnap.level, toLevel: snap.level },
          __debug_source: 'differ' })
      }

      const prevIt = this._prevItems.get(pid) || []
      const added = snap.items.filter(id => !prevIt.includes(id))
      const removed = prevIt.filter(id => !snap.items.includes(id))
      for (const itemId of added) {
        events.push({ id: generateEventId(), type: 'item_purchase', gameTime: gt, timestamp: cur.timestamp, sessionId,
          participants: [pid], team: snap.team,
          payload: { champion: snap.championName, itemId, currentItems: snap.items.slice() }, __debug_source: 'differ' })
      }
      for (const itemId of removed) {
        events.push({ id: generateEventId(), type: 'item_sold', gameTime: gt, timestamp: cur.timestamp, sessionId,
          participants: [pid], team: snap.team,
          payload: { champion: snap.championName, itemId }, __debug_source: 'differ' })
      }
      this._prevItems.set(pid, snap.items.slice())

      if (!snap.isDead && prevSnap.isDead) {
        events.push({ id: generateEventId(), type: 'respawn', gameTime: gt, timestamp: cur.timestamp, sessionId,
          participants: [pid], team: snap.team, payload: { champion: snap.championName }, __debug_source: 'differ' })
      }
    }
    return events
  }

  private _seed(snap: GameSnapshot): void {
    for (const [pid, s] of Object.entries(snap.players)) {
      this._prevHashes.set(pid, computeCompositeHash(s))
      this._prevItems.set(pid, s.items.slice())
    }
  }

  get stats() {
    const t = this._diffHits + this._diffMisses
    return { hits: this._diffHits, misses: this._diffMisses, ratio: t > 0 ? this._diffHits / t : 0 }
  }

  reset(): void {
    this._prevHashes.clear(); this._prevItems.clear()
    this._diffHits = 0; this._diffMisses = 0; this._killStreaks.clear()
  }
}

// ── EventClassifier ──────────────────────────────────────────────────

export class EventClassifier {
  private _seen: Set<string> = new Set()
  private _freq: Map<string, number> = new Map()

  classifyRiotEvent(raw: Record<string, unknown>, sessionId: string): LiveGameEvent | null {
    const name = raw['EventName'] as string | undefined
    if (!name) return null
    const eid = String(raw['EventID'] ?? '')
    if (this._seen.has(eid)) return null
    this._seen.add(eid)
    this._freq.set(name, (this._freq.get(name) || 0) + 1)

    const gt = (raw['EventTime'] as number) || 0
    const base = { gameTime: gt, timestamp: Date.now(), sessionId, __debug_source: 'classifier' as const }

    switch (name) {
      case 'DragonKill':
        return { id: generateEventId(), type: 'dragon', ...base, participants: [String(raw['KillerName'] || '')],
          team: raw['Stolen'] === 'True' ? 'contested' : 'unknown',
          payload: { dragonType: raw['DragonType'], killer: raw['KillerName'], stolen: raw['Stolen'] === 'True' } }
      case 'BaronKill':
        return { id: generateEventId(), type: 'baron', ...base, participants: [String(raw['KillerName'] || '')], team: 'unknown',
          payload: { killer: raw['KillerName'], stolen: raw['Stolen'] === 'True' } }
      case 'HeraldKill':
        return { id: generateEventId(), type: 'herald', ...base, participants: [String(raw['KillerName'] || '')], team: 'unknown',
          payload: { killer: raw['KillerName'] } }
      case 'TurretKilled':
        return { id: generateEventId(), type: 'tower', ...base, participants: [String(raw['KillerName'] || '')], team: 'unknown',
          payload: { turretName: raw['TurretKilled'], killer: raw['KillerName'] } }
      case 'InhibKilled':
        return { id: generateEventId(), type: 'inhibitor', ...base, participants: [String(raw['KillerName'] || '')], team: 'unknown',
          payload: { inhibName: raw['InhibKilled'], killer: raw['KillerName'] } }
      case 'ChampionKill':
        return { id: generateEventId(), type: this._seen.size <= 2 ? 'first_blood' : 'kill', ...base,
          participants: [String(raw['KillerName'] || ''), String(raw['VictimName'] || '')], team: 'unknown',
          payload: { killer: raw['KillerName'], victim: raw['VictimName'], assisters: raw['Assisters'] || [] } }
      case 'Multikill':
        return { id: generateEventId(), type: 'multikill', ...base, participants: [String(raw['KillerName'] || '')], team: 'unknown',
          payload: { killer: raw['KillerName'], killStreak: raw['KillStreak'] } }
      case 'Ace':
        return { id: generateEventId(), type: 'ace', ...base, participants: [String(raw['Acer'] || '')],
          team: String(raw['AcingTeam'] || 'unknown'), payload: { acer: raw['Acer'], acingTeam: raw['AcingTeam'] } }
      case 'GameStart':
        return { id: generateEventId(), type: 'game_start', ...base, participants: [], team: 'all', payload: {} }
      case 'GameEnd':
        return { id: generateEventId(), type: 'game_end', ...base, participants: [], team: String(raw['Result'] || 'unknown'),
          payload: { result: raw['Result'] } }
      default: return null
    }
  }

  get frequency(): Map<string, number> { return new Map(this._freq) }
  reset(): void { this._seen.clear(); this._freq.clear() }
}

// ── DerivedTimeSeriesEngine ──────────────────────────────────────────

export class DerivedTimeSeriesEngine {
  private _goldDiff: TimeSeriesPoint[] = []
  private _allyKills: TimeSeriesPoint[] = []
  private _enemyKills: TimeSeriesPoint[] = []
  private _cspm: Map<string, TimeSeriesPoint[]> = new Map()
  private _xp: Map<string, TimeSeriesPoint[]> = new Map()
  private _deaths: Map<string, TimeSeriesPoint[]> = new Map()
  private _allyTeam: string = ''
  private _totalPts: number = 0
  private _alpha: number = 0.3
  private _ewma: Map<string, number> = new Map()

  setAllyTeam(team: string): void { this._allyTeam = team }
  setEwmaAlpha(a: number): void { this._alpha = a }

  ingestSnapshot(snap: GameSnapshot): void {
    const gt = snap.gameTime
    if (gt <= 0) return
    let ak = 0, ek = 0, acs = 0, ecs = 0

    for (const [pid, s] of Object.entries(snap.players)) {
      const ally = s.team === this._allyTeam
      if (ally) { ak += s.kills; acs += s.creepScore } else { ek += s.kills; ecs += s.creepScore }

      if (!this._cspm.has(pid)) this._cspm.set(pid, [])
      const mins = gt / 60
      const raw = mins > 0 ? s.creepScore / mins : 0
      const prev = this._ewma.get(pid) ?? raw
      const smoothed = this._alpha * raw + (1 - this._alpha) * prev
      this._ewma.set(pid, smoothed)
      this._cspm.get(pid)!.push({ gameTime: gt, value: smoothed })

      if (!this._xp.has(pid)) this._xp.set(pid, [])
      this._xp.get(pid)!.push({ gameTime: gt, value: s.level })

      if (!this._deaths.has(pid)) this._deaths.set(pid, [])
      this._deaths.get(pid)!.push({ gameTime: gt, value: s.deaths })
    }

    this._goldDiff.push({ gameTime: gt, value: acs - ecs })
    this._allyKills.push({ gameTime: gt, value: ak })
    this._enemyKills.push({ gameTime: gt, value: ek })
    this._totalPts++
  }

  getTimeSeries(): DerivedTimeSeries {
    return {
      goldDifferential: this._goldDiff.slice(), allyTotalKills: this._allyKills.slice(),
      enemyTotalKills: this._enemyKills.slice(), csPerMinute: new Map(this._cspm),
      xpCurves: new Map(this._xp), deathTimeline: new Map(this._deaths)
    }
  }

  getLatestGoldDiff(): number { return this._goldDiff.length > 0 ? this._goldDiff[this._goldDiff.length - 1].value : 0 }
  get totalPoints(): number { return this._totalPts }

  reset(): void {
    this._goldDiff = []; this._allyKills = []; this._enemyKills = []
    this._cspm.clear(); this._xp.clear(); this._deaths.clear(); this._ewma.clear()
    this._allyTeam = ''; this._totalPts = 0
  }
}

// ── LiveIngestorSession ──────────────────────────────────────────────

export interface LiveIngestorSession {
  sessionId: string; startedAt: number; endedAt: number | null
  gameMode: string; mapName: string; allyTeam: string
  snapshotCount: number; eventCount: number; phases: GamePhase[]; lastGameTime: number
}

export type LiveEventListener = (event: LiveGameEvent) => void
export type SnapshotListener = (snapshot: GameSnapshot) => void

// ── LiveIngestor ─────────────────────────────────────────────────────

export class LiveIngestor {
  private _cfg: LiveIngestorConfig
  private _differ: SnapshotDiffer
  private _classifier: EventClassifier
  private _ts: DerivedTimeSeriesEngine
  private _snapshots: RingBuffer<GameSnapshot>
  private _events: RingBuffer<LiveGameEvent>
  private _session: LiveIngestorSession | null = null
  private _prevSnap: GameSnapshot | null = null
  private _timer: ReturnType<typeof setTimeout> | null = null
  private _polling: boolean = false
  private _pollDurs: number[] = []
  private _totalPolls: number = 0
  private _totalErrors: number = 0
  private _consErrors: number = 0
  private _consIdle: number = 0
  private _curInterval: number
  private _lastPoll: number = 0
  private _evtListeners: Set<LiveEventListener> = new Set()
  private _snapListeners: Set<SnapshotListener> = new Set()
  private _fetchPL: () => Promise<any[]>
  private _fetchGS: () => Promise<any>
  private _fetchED: () => Promise<{ Events: Record<string, unknown>[] }>
  private _phase: GamePhase = 'unknown'

  constructor(
    fetchers: { fetchPlayerList: () => Promise<any[]>; fetchGameStats: () => Promise<any>; fetchEventData: () => Promise<{ Events: Record<string, unknown>[] }> },
    config?: Partial<LiveIngestorConfig>
  ) {
    this._cfg = { ...DEFAULT_CONFIG, ...config }
    this._curInterval = this._cfg.pollIntervalMs
    this._differ = new SnapshotDiffer()
    this._classifier = new EventClassifier()
    this._ts = new DerivedTimeSeriesEngine()
    this._ts.setEwmaAlpha(this._cfg.ewmaAlpha)
    this._snapshots = new RingBuffer(this._cfg.snapshotBufferCapacity)
    this._events = new RingBuffer(this._cfg.eventBufferCapacity)
    this._fetchPL = fetchers.fetchPlayerList
    this._fetchGS = fetchers.fetchGameStats
    this._fetchED = fetchers.fetchEventData

    introspector.registerProbe('live-ingestor', () => ({
      isPolling: this._polling, totalPolls: this._totalPolls,
      events: this._events.length, errors: this._consErrors,
      intervalMs: this._curInterval
    }))
  }

  get isPolling() { return this._polling }
  get session() { return this._session }
  get timeSeries() { return this._ts }
  get differ() { return this._differ }

  onEvent(l: LiveEventListener) { this._evtListeners.add(l); return () => { this._evtListeners.delete(l) } }
  onSnapshot(l: SnapshotListener) { this._snapListeners.add(l); return () => { this._snapListeners.delete(l) } }

  startSession(params: { allyTeam: string }): string {
    const sid = generateSessionId()
    this._session = { sessionId: sid, startedAt: Date.now(), endedAt: null, gameMode: '', mapName: '', allyTeam: params.allyTeam, snapshotCount: 0, eventCount: 0, phases: [], lastGameTime: 0 }
    this._differ.reset(); this._classifier.reset(); this._ts.reset()
    this._ts.setAllyTeam(params.allyTeam)
    this._prevSnap = null; this._consErrors = 0; this._consIdle = 0
    this._curInterval = this._cfg.pollIntervalMs
    return sid
  }

  endSession(): LiveIngestorSession | null {
    if (!this._session) return null
    this.stopPolling(); this._session.endedAt = Date.now()
    return { ...this._session }
  }

  startPolling(): void {
    if (this._polling) return
    if (!this._session) this.startSession({ allyTeam: 'ORDER' })
    this._polling = true; this._schedulePoll()
  }

  stopPolling(): void {
    this._polling = false
    if (this._timer) { clearTimeout(this._timer); this._timer = null }
  }

  transitionPhase(p: GamePhase): void {
    if (p === this._phase) return
    this._phase = p
    if (this._session && !this._session.phases.includes(p)) this._session.phases.push(p)
    if (p === 'post-game') this.stopPolling()
  }

  getStats(): LiveIngestorStats {
    const avg = this._pollDurs.length > 0 ? this._pollDurs.reduce((a, b) => a + b, 0) / this._pollDurs.length : 0
    const ds = this._differ.stats
    return {
      totalPolls: this._totalPolls, totalSnapshots: this._snapshots.length,
      totalEvents: this._events.length, totalErrors: this._totalErrors,
      consecutiveErrors: this._consErrors, lastPollTimestamp: this._lastPoll,
      lastSnapshotGameTime: this._session?.lastGameTime ?? 0,
      pollDurationAvgMs: Math.round(avg * 100) / 100,
      sessionId: this._session?.sessionId ?? '', isPolling: this._polling,
      diffHits: ds.hits, diffMisses: ds.misses,
      derivedSeriesPoints: this._ts.totalPoints,
      currentPollIntervalMs: this._curInterval
    }
  }

  getSnapshots(): GameSnapshot[] { return this._snapshots.toArray() }
  getEvents(): LiveGameEvent[] { return this._events.toArray() }
  getEventsByType(t: LiveEventType): LiveGameEvent[] { return this._events.toArray().filter(e => e.type === t) }

  getObjectiveTimeline(): LiveGameEvent[] {
    const ot: Set<LiveEventType> = new Set(['dragon','baron','herald','tower','inhibitor','voidgrub','atakhan'])
    return this._events.toArray().filter(e => ot.has(e.type)).sort((a, b) => a.gameTime - b.gameTime)
  }

  private _schedulePoll(): void {
    if (!this._polling) return
    this._timer = setTimeout(() => { this._pollOnce().then(() => this._schedulePoll()) }, this._curInterval)
  }

  private async _pollOnce(): Promise<void> {
    if (!this._session) return
    const t0 = Date.now()
    this._totalPolls++; this._lastPoll = t0

    try {
      const [pl, gs, ed] = await Promise.all([this._fetchPL(), this._fetchGS(), this._fetchED()])
      this._consErrors = 0
      if (!this._session.gameMode && gs.gameMode) this._session.gameMode = gs.gameMode

      const players: Record<string, PlayerSnapshot> = {}
      for (const p of pl) {
        const k = p.riotId || p.summonerName || p.championName
        players[k] = { championName: p.championName, team: p.team, level: p.level,
          kills: p.scores?.kills ?? 0, deaths: p.scores?.deaths ?? 0, assists: p.scores?.assists ?? 0,
          creepScore: p.scores?.creepScore ?? 0, wardScore: p.scores?.wardScore ?? 0,
          items: (p.items || []).filter((it: any) => it.itemID > 0).map((it: any) => it.itemID),
          isDead: p.isDead, respawnTimer: p.respawnTimer ?? 0,
          summonerName: p.summonerName, riotId: p.riotId || '' }
      }
      const snap: GameSnapshot = { gameTime: gs.gameTime, timestamp: Date.now(), sessionId: this._session.sessionId, players, gameMode: gs.gameMode, mapName: gs.mapName }
      this._snapshots.push(snap); this._session.snapshotCount++; this._session.lastGameTime = gs.gameTime

      const diffs = this._differ.diff(this._prevSnap, snap, this._session.sessionId)
      this._prevSnap = snap

      if (ed.Events && Array.isArray(ed.Events)) {
        for (const r of ed.Events) {
          const c = this._classifier.classifyRiotEvent(r, this._session.sessionId)
          if (c) { this._events.push(c); this._session.eventCount++; this._emitEvent(c) }
        }
      }
      for (const ev of diffs) { this._events.push(ev); this._session.eventCount++; this._emitEvent(ev) }

      if (this._cfg.adaptivePollEnabled) {
        if (diffs.length === 0) { this._consIdle++; this._curInterval = Math.min(this._cfg.adaptivePollMaxMs, this._cfg.pollIntervalMs + this._consIdle * 200) }
        else { this._consIdle = 0; this._curInterval = this._cfg.pollIntervalMs }
      }

      if (this._cfg.enableDerivedTimeSeries) this._ts.ingestSnapshot(snap)
      for (const l of this._snapListeners) { try { l(snap) } catch {} }

      this._pollDurs.push(Date.now() - t0)
      if (this._pollDurs.length > 100) this._pollDurs = this._pollDurs.slice(-50)
    } catch {
      this._totalErrors++; this._consErrors++
      if (this._consErrors >= this._cfg.maxConsecutiveErrors) this.stopPolling()
    }
  }

  private _emitEvent(e: LiveGameEvent): void {
    for (const l of this._evtListeners) { try { l(e) } catch {} }
  }

  dispose(): void {
    this.stopPolling(); this._evtListeners.clear(); this._snapListeners.clear()
    this._differ.reset(); this._classifier.reset(); this._ts.reset()
  }
}

// ── Factory ──────────────────────────────────────────────────────────

export function createLiveIngestor(
  fetchers: { fetchPlayerList: () => Promise<any[]>; fetchGameStats: () => Promise<any>; fetchEventData: () => Promise<{ Events: Record<string, unknown>[] }> },
  config?: Partial<LiveIngestorConfig>
): LiveIngestor {
  return new LiveIngestor(fetchers, config)
}

// ── Debug ────────────────────────────────────────────────────────────

export function debugPrintIngestorStats(ingestor: LiveIngestor): void {
  const s = ingestor.getStats()
  console.log('\n╔══════════════════════════════════════════════╗')
  console.log('║   NexusLiveIngestor — Stats                  ║')
  console.log('╠══════════════════════════════════════════════╣')
  console.log(`║ Polling:     ${String(s.isPolling).padEnd(32)}║`)
  console.log(`║ Polls:       ${String(s.totalPolls).padEnd(32)}║`)
  console.log(`║ Snapshots:   ${String(s.totalSnapshots).padEnd(32)}║`)
  console.log(`║ Events:      ${String(s.totalEvents).padEnd(32)}║`)
  console.log(`║ Errors:      ${String(s.totalErrors).padEnd(32)}║`)
  console.log(`║ Diff hit%:   ${((s.diffHits / Math.max(1, s.diffHits + s.diffMisses)) * 100).toFixed(1).padEnd(31)}%║`)
  console.log(`║ Avg poll:    ${s.pollDurationAvgMs.toFixed(1).padEnd(30)}ms║`)
  console.log(`║ Interval:    ${String(s.currentPollIntervalMs).padEnd(30)}ms║`)
  console.log('╚══════════════════════════════════════════════╝\n')
}
