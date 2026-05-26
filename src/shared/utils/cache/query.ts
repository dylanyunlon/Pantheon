import type { MatchHistoryGamesAnalysisAll } from '../analysis'
import type { RankedStats } from '@shared/types/league-client/ranked'
import type { CacheEntry } from './layer'

export type PantheonDataType = 'analysis' | 'ranked' | 'champion-mastery' | 'match-history'

export type PantheonQueryStatus = 'init' | 'loading' | 'loaded' | 'error'

export interface PantheonQueryKey {
  type: PantheonDataType
  puuid: string
}

export interface PantheonSubjectPayload<T = unknown> extends CacheEntry<T> {
  isOptimistic: boolean
}

export interface PantheonChanges {
  updated: Set<string>
  added: Set<string>
  removed: Set<string>
  isEmpty(): boolean
}

export function createPantheonChanges(): PantheonChanges {
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

export interface PantheonBatchContext {
  changes: PantheonChanges
  write<T>(key: string, value: T, status: PantheonQueryStatus): CacheEntry<T>
  read<T>(key: string): CacheEntry<T> | undefined
  delete(key: string, status: PantheonQueryStatus): void
}

export interface DataAvailability {
  puuid: string
  analysis: PantheonQueryStatus
  ranked: PantheonQueryStatus
  championMastery: PantheonQueryStatus
  matchHistory: PantheonQueryStatus
}

export type DataAvailabilityField = 'analysis' | 'ranked' | 'championMastery' | 'matchHistory'

function dataTypeToField(type: PantheonDataType): DataAvailabilityField {
  switch (type) {
    case 'champion-mastery': return 'championMastery'
    case 'match-history': return 'matchHistory'
    case 'analysis': return 'analysis'
    case 'ranked': return 'ranked'
  }
}

export class PantheonDataTracker {
  private _availability: Map<string, DataAvailability> = new Map()
  private _listeners: Array<(changes: PantheonChanges) => void> = []

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

  setStatus(puuid: string, type: PantheonDataType, status: PantheonQueryStatus): PantheonChanges {
    const avail = this.getAvailability(puuid)
    const field = dataTypeToField(type)
    const oldStatus = avail[field]
    avail[field] = status

    const changes = createPantheonChanges()
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

  getLoadedPuuids(type: PantheonDataType): string[] {
    const field = dataTypeToField(type)
    const result: string[] = []
    for (const [puuid, avail] of this._availability) {
      if (avail[field] === 'loaded') {
        result.push(puuid)
      }
    }
    return result
  }

  getLoadingPuuids(type: PantheonDataType): string[] {
    const field = dataTypeToField(type)
    const result: string[] = []
    for (const [puuid, avail] of this._availability) {
      if (avail[field] === 'loading') {
        result.push(puuid)
      }
    }
    return result
  }

  getErrorPuuids(type: PantheonDataType): string[] {
    const field = dataTypeToField(type)
    const result: string[] = []
    for (const [puuid, avail] of this._availability) {
      if (avail[field] === 'error') {
        result.push(puuid)
      }
    }
    return result
  }

  onChanges(listener: (changes: PantheonChanges) => void): () => void {
    this._listeners.push(listener)
    return () => {
      const idx = this._listeners.indexOf(listener)
      if (idx >= 0) this._listeners.splice(idx, 1)
    }
  }

  private _notifyListeners(changes: PantheonChanges) {
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

  getWeightedTeamCompleteness(puuids: string[], weights?: Record<string, number>): number {
    if (puuids.length === 0) return 0
    const defaultWeight = 1.0
    let totalWeight = 0
    let weightedSum = 0
    for (const puuid of puuids) {
      const w = weights?.[puuid] ?? defaultWeight
      weightedSum += this.getCompleteness(puuid) * w
      totalWeight += w
    }
    return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0
  }

  getFailedPuuids(): string[] {
    const result: string[] = []
    for (const [puuid, avail] of this._availability) {
      const statuses = [avail.analysis, avail.ranked, avail.matchHistory, avail.championMastery]
      if (statuses.some((s) => s === 'error') && !statuses.some((s) => s === 'loading')) {
        result.push(puuid)
      }
    }
    return result
  }

  getLoadProgress(): { loaded: number; total: number; percentage: number } {
    let loaded = 0
    let total = 0
    for (const [, avail] of this._availability) {
      const statuses = [avail.analysis, avail.ranked, avail.matchHistory, avail.championMastery]
      total += statuses.length
      loaded += statuses.filter((s) => s === 'loaded').length
    }
    return {
      loaded,
      total,
      percentage: total > 0 ? Math.round((loaded / total) * 100) : 0
    }
  }

  clear() {
    this._availability.clear()
  }
}
