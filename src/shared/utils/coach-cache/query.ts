import type { MatchHistoryGamesAnalysisAll } from '../analysis'
import type { RankedStats } from '@shared/types/league-client/ranked'
import type { CacheEntry } from './layer'

export type CoachDataType = 'analysis' | 'ranked' | 'champion-mastery' | 'match-history'

export type CoachQueryStatus = 'init' | 'loading' | 'loaded' | 'error'

export interface CoachQueryKey {
  type: CoachDataType
  puuid: string
}

export interface CoachSubjectPayload<T = unknown> extends CacheEntry<T> {
  isOptimistic: boolean
}

export interface CoachChanges {
  updated: Set<string>
  added: Set<string>
  removed: Set<string>
  isEmpty(): boolean
}

export function createCoachChanges(): CoachChanges {
  const updated = new Set<string>()
  const added = new Set<string>()
  const removed = new Set<string>()
  return {
    updated,
    added,
    removed,
    isEmpty() {
      return updated.size === 0 && added.size === 0 && removed.size === 0
    }
  }
}

export interface CoachBatchContext {
  changes: CoachChanges
  write<T>(key: string, value: T, status: CoachQueryStatus): CacheEntry<T>
  read<T>(key: string): CacheEntry<T> | undefined
  delete(key: string, status: CoachQueryStatus): void
}

export interface DataAvailability {
  puuid: string
  analysis: CoachQueryStatus
  ranked: CoachQueryStatus
  championMastery: CoachQueryStatus
  matchHistory: CoachQueryStatus
}

export class CoachDataTracker {
  private _availability: Map<string, DataAvailability> = new Map()
  private _listeners: Array<(changes: CoachChanges) => void> = []

  getAvailability(puuid: string): DataAvailability {
    let entry = this._availability.get(puuid)
    if (!entry) {
      entry = {
        puuid,
        analysis: 'init',
        ranked: 'init',
        championMastery: 'init',
        matchHistory: 'init'
      }
      this._availability.set(puuid, entry)
    }
    return entry
  }

  setStatus(puuid: string, type: CoachDataType, status: CoachQueryStatus): CoachChanges {
    const avail = this.getAvailability(puuid)
    const oldStatus = avail[type === 'champion-mastery' ? 'championMastery' : type === 'match-history' ? 'matchHistory' : type]
    const fieldKey = type === 'champion-mastery' ? 'championMastery' : type === 'match-history' ? 'matchHistory' : type
    ;(avail as any)[fieldKey] = status

    const changes = createCoachChanges()
    const changeKey = `${puuid}:${type}`

    if (oldStatus === 'init' && status !== 'init') {
      changes.added.add(changeKey)
    } else if (oldStatus !== status) {
      changes.updated.add(changeKey)
    }

    if (!changes.isEmpty()) {
      this._notifyListeners(changes)
    }

    return changes
  }

  getCompleteness(puuid: string): number {
    const avail = this.getAvailability(puuid)
    let score = 0
    if (avail.analysis === 'loaded') score += 40
    if (avail.ranked === 'loaded') score += 25
    if (avail.matchHistory === 'loaded') score += 25
    if (avail.championMastery === 'loaded') score += 10
    return score
  }

  getTeamCompleteness(puuids: string[]): number {
    if (puuids.length === 0) return 0
    const total = puuids.reduce((sum, p) => sum + this.getCompleteness(p), 0)
    return Math.round(total / puuids.length)
  }

  isReadyForAnalysis(puuid: string): boolean {
    const avail = this.getAvailability(puuid)
    return avail.analysis === 'loaded'
  }

  isFullyLoaded(puuid: string): boolean {
    const avail = this.getAvailability(puuid)
    return avail.analysis === 'loaded' &&
      avail.ranked === 'loaded' &&
      avail.matchHistory === 'loaded' &&
      avail.championMastery === 'loaded'
  }

  getLoadedPuuids(type: CoachDataType): string[] {
    const fieldKey = type === 'champion-mastery' ? 'championMastery' : type === 'match-history' ? 'matchHistory' : type
    const result: string[] = []
    for (const [puuid, avail] of this._availability) {
      if ((avail as any)[fieldKey] === 'loaded') {
        result.push(puuid)
      }
    }
    return result
  }

  getLoadingPuuids(type: CoachDataType): string[] {
    const fieldKey = type === 'champion-mastery' ? 'championMastery' : type === 'match-history' ? 'matchHistory' : type
    const result: string[] = []
    for (const [puuid, avail] of this._availability) {
      if ((avail as any)[fieldKey] === 'loading') {
        result.push(puuid)
      }
    }
    return result
  }

  getErrorPuuids(type: CoachDataType): string[] {
    const fieldKey = type === 'champion-mastery' ? 'championMastery' : type === 'match-history' ? 'matchHistory' : type
    const result: string[] = []
    for (const [puuid, avail] of this._availability) {
      if ((avail as any)[fieldKey] === 'error') {
        result.push(puuid)
      }
    }
    return result
  }

  onChanges(listener: (changes: CoachChanges) => void): () => void {
    this._listeners.push(listener)
    return () => {
      const idx = this._listeners.indexOf(listener)
      if (idx >= 0) this._listeners.splice(idx, 1)
    }
  }

  private _notifyListeners(changes: CoachChanges) {
    for (const listener of this._listeners) {
      try {
        listener(changes)
      } catch (_) {}
    }
  }

  getAllAvailability(): Map<string, DataAvailability> {
    return new Map(this._availability)
  }

  getSummary(): {
    totalPlayers: number
    fullyLoaded: number
    partiallyLoaded: number
    loading: number
    errors: number
  } {
    let fullyLoaded = 0
    let partiallyLoaded = 0
    let loading = 0
    let errors = 0

    for (const [, avail] of this._availability) {
      const statuses = [avail.analysis, avail.ranked, avail.matchHistory, avail.championMastery]
      if (statuses.every((s) => s === 'loaded')) {
        fullyLoaded++
      } else if (statuses.some((s) => s === 'error')) {
        errors++
      } else if (statuses.some((s) => s === 'loading')) {
        loading++
      } else if (statuses.some((s) => s === 'loaded')) {
        partiallyLoaded++
      }
    }

    return {
      totalPlayers: this._availability.size,
      fullyLoaded,
      partiallyLoaded,
      loading,
      errors
    }
  }

  clear() {
    this._availability.clear()
  }
}
