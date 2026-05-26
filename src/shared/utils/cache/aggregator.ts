import type { MatchHistoryGamesAnalysisAll, MatchHistoryGamesAnalysisSummary } from '../analysis'
import type { RankedStats } from '@shared/types/league-client/ranked'
import type { PantheonChanges } from './query'
import { createPantheonChanges } from './query'

export type AggregationDimension =
  | 'winRate'
  | 'kda'
  | 'damage'
  | 'tankiness'
  | 'vision'
  | 'cs'
  | 'gold'
  | 'participation'
  | 'trueDamage'
  | 'goldEfficiency'
  | 'kdaTrend'

export interface DimensionWeight {
  dimension: AggregationDimension
  weight: number
}

export interface AggregatedTeamProfile {
  avgWinRate: number
  avgKda: number
  avgDamageShare: number
  avgTankinessShare: number
  avgVisionScore: number
  avgCsPerMinute: number
  avgGoldShare: number
  avgParticipation: number
  avgTrueDamageShare: number
  avgGoldEfficiency: number
  avgKdVariance: number
  memberCount: number
  loadedCount: number
  completeness: number
}

export interface TeamComparisonResult {
  allyProfile: AggregatedTeamProfile
  enemyProfile: AggregatedTeamProfile
  dimensionDeltas: Record<AggregationDimension, number>
  overallDelta: number
  confidence: number
}

const EMPTY_PROFILE: AggregatedTeamProfile = {
  avgWinRate: 0,
  avgKda: 0,
  avgDamageShare: 0,
  avgTankinessShare: 0,
  avgVisionScore: 0,
  avgCsPerMinute: 0,
  avgGoldShare: 0,
  avgParticipation: 0,
  avgTrueDamageShare: 0,
  avgGoldEfficiency: 0,
  avgKdVariance: 0,
  memberCount: 0,
  loadedCount: 0,
  completeness: 0
}

const DEFAULT_WEIGHTS: DimensionWeight[] = [
  { dimension: 'winRate', weight: 0.25 },
  { dimension: 'kda', weight: 0.20 },
  { dimension: 'damage', weight: 0.15 },
  { dimension: 'tankiness', weight: 0.05 },
  { dimension: 'vision', weight: 0.05 },
  { dimension: 'cs', weight: 0.10 },
  { dimension: 'gold', weight: 0.10 },
  { dimension: 'participation', weight: 0.08 },
  { dimension: 'trueDamage', weight: 0.04 },
  { dimension: 'goldEfficiency', weight: 0.05 },
  { dimension: 'kdaTrend', weight: 0.03 }
]

function extractDimensionValue(
  summary: MatchHistoryGamesAnalysisSummary,
  dim: AggregationDimension
): number {
  switch (dim) {
    case 'winRate':
      return summary.winRate
    case 'kda':
      return Math.min(summary.averageKda / 6.0, 1.0)
    case 'damage':
      return summary.averageDamageDealtToChampionShareToTop
    case 'tankiness':
      return summary.averageDamageTakenShareToTop
    case 'vision':
      return Math.min(summary.averageVisionScore / 3.0, 1.0)
    case 'cs':
      return Math.min(summary.averageCsPerMinute / 10.0, 1.0)
    case 'gold':
      return summary.averageGoldShareToTop
    case 'participation':
      return summary.averageKillParticipationRate
    case 'trueDamage':
      return summary.averageTrueDamageDealtToChampionShareOfTeam
    case 'goldEfficiency':
      return Math.min(summary.averageDamageGoldEfficiency / 2.0, 1.0)
    case 'kdaTrend':
      return Math.min(summary.averageKda / 5.0, 1.0) * (summary.winningStreak > 0 ? 1.1 : summary.losingStreak > 2 ? 0.8 : 1.0)
    default:
      return 0
  }
}

export function aggregateTeamProfile(
  puuids: string[],
  analyses: Record<string, MatchHistoryGamesAnalysisAll>
): AggregatedTeamProfile {
  if (puuids.length === 0) return { ...EMPTY_PROFILE }

  let totalWinRate = 0
  let totalKda = 0
  let totalDamageShare = 0
  let totalTankinessShare = 0
  let totalVisionScore = 0
  let totalCsPerMinute = 0
  let totalGoldShare = 0
  let totalParticipation = 0
  let totalTrueDamageShare = 0
  let totalGoldEfficiency = 0
  const kdaValues: number[] = []
  let loadedCount = 0

  for (const puuid of puuids) {
    const analysis = analyses[puuid]
    if (!analysis) continue
    const s = analysis.summary
    totalWinRate += s.winRate
    totalKda += s.averageKda
    totalDamageShare += s.averageDamageDealtToChampionShareToTop
    totalTankinessShare += s.averageDamageTakenShareToTop
    totalVisionScore += s.averageVisionScore
    totalCsPerMinute += s.averageCsPerMinute
    totalGoldShare += s.averageGoldShareToTop
    totalParticipation += s.averageKillParticipationRate
    totalTrueDamageShare += s.averageTrueDamageDealtToChampionShareOfTeam
    totalGoldEfficiency += s.averageDamageGoldEfficiency
    kdaValues.push(s.averageKda)
    loadedCount++
  }

  if (loadedCount === 0) return { ...EMPTY_PROFILE, memberCount: puuids.length }

  const avgKda = kdaValues.reduce((s, v) => s + v, 0) / loadedCount
  const kdaVariance = kdaValues.length > 1
    ? kdaValues.reduce((s, v) => s + Math.pow(v - avgKda, 2), 0) / kdaValues.length
    : 0

  return {
    avgWinRate: totalWinRate / loadedCount,
    avgKda: totalKda / loadedCount,
    avgDamageShare: totalDamageShare / loadedCount,
    avgTankinessShare: totalTankinessShare / loadedCount,
    avgVisionScore: totalVisionScore / loadedCount,
    avgCsPerMinute: totalCsPerMinute / loadedCount,
    avgGoldShare: totalGoldShare / loadedCount,
    avgParticipation: totalParticipation / loadedCount,
    avgTrueDamageShare: totalTrueDamageShare / loadedCount,
    avgGoldEfficiency: totalGoldEfficiency / loadedCount,
    avgKdVariance: kdaVariance,
    memberCount: puuids.length,
    loadedCount,
    completeness: Math.round((loadedCount / puuids.length) * 100)
  }
}

export function compareTeams(
  allyPuuids: string[],
  enemyPuuids: string[],
  analyses: Record<string, MatchHistoryGamesAnalysisAll>,
  weights: DimensionWeight[] = DEFAULT_WEIGHTS
): TeamComparisonResult {
  const allyProfile = aggregateTeamProfile(allyPuuids, analyses)
  const enemyProfile = aggregateTeamProfile(enemyPuuids, analyses)
  const dimensionDeltas: Record<AggregationDimension, number> = {
    winRate: 0,
    kda: 0,
    damage: 0,
    tankiness: 0,
    vision: 0,
    cs: 0,
    gold: 0,
    participation: 0,
    trueDamage: 0,
    goldEfficiency: 0,
    kdaTrend: 0
  }

  let overallDelta = 0
  let totalWeight = 0

  for (const { dimension, weight } of weights) {
    const allyVal = getDimensionFromProfile(allyProfile, dimension)
    const enemyVal = getDimensionFromProfile(enemyProfile, dimension)
    const delta = allyVal - enemyVal
    dimensionDeltas[dimension] = delta
    overallDelta += delta * weight
    totalWeight += weight
  }

  if (totalWeight > 0) {
    overallDelta /= totalWeight
  }

  const minLoaded = Math.min(allyProfile.loadedCount, enemyProfile.loadedCount)
  const maxMembers = Math.max(allyProfile.memberCount, enemyProfile.memberCount)
  const coverageRatio = maxMembers > 0 ? Math.min(minLoaded / maxMembers, 1.0) : 0

  let sampleConfidence = 0.5
  const allPuuids = [...allyPuuids, ...enemyPuuids]
  const gameCounts: number[] = []
  for (const puuid of allPuuids) {
    const analysis = analyses[puuid]
    if (analysis) gameCounts.push(analysis.summary.count)
  }
  if (gameCounts.length > 0) {
    const harmonicSum = gameCounts.reduce((s, c) => s + 1 / Math.max(c, 1), 0)
    const harmonicMean = gameCounts.length / harmonicSum
    sampleConfidence = Math.min(harmonicMean / 15, 1.0)
  }

  const confidence = coverageRatio * 0.5 + sampleConfidence * 0.35 + (allyProfile.completeness / 100) * 0.15

  return {
    allyProfile,
    enemyProfile,
    dimensionDeltas,
    overallDelta,
    confidence
  }
}

function getDimensionFromProfile(
  profile: AggregatedTeamProfile,
  dim: AggregationDimension
): number {
  switch (dim) {
    case 'winRate':
      return profile.avgWinRate
    case 'kda':
      return Math.min(profile.avgKda / 6.0, 1.0)
    case 'damage':
      return profile.avgDamageShare
    case 'tankiness':
      return profile.avgTankinessShare
    case 'vision':
      return Math.min(profile.avgVisionScore / 3.0, 1.0)
    case 'cs':
      return Math.min(profile.avgCsPerMinute / 10.0, 1.0)
    case 'gold':
      return profile.avgGoldShare
    case 'participation':
      return profile.avgParticipation
    case 'trueDamage':
      return profile.avgTrueDamageShare
    case 'goldEfficiency':
      return Math.min(profile.avgGoldEfficiency / 2.0, 1.0)
    case 'kdaTrend':
      return Math.min(profile.avgKda / 5.0, 1.0)
    default:
      return 0
  }
}

export class RingReducer<T> {
  private _slots: { key: string; value: T }[] = []
  private _reduceFn: (acc: T, cur: T) => T
  private _identity: T

  constructor(reduceFn: (acc: T, cur: T) => T, identity: T) {
    this._reduceFn = reduceFn
    this._identity = identity
  }

  push(key: string, value: T): void {
    const existing = this._slots.findIndex((s) => s.key === key)
    if (existing >= 0) {
      this._slots[existing].value = value
    } else {
      this._slots.push({ key, value })
    }
  }

  reduce(): T {
    if (this._slots.length === 0) return this._identity
    return this._slots.reduce((acc, slot) => ({
      key: 'reduced',
      value: this._reduceFn(acc.value, slot.value)
    }), { key: '_acc', value: this._identity }).value
  }

  remove(key: string): boolean {
    const idx = this._slots.findIndex((s) => s.key === key)
    if (idx >= 0) {
      this._slots.splice(idx, 1)
      return true
    }
    return false
  }

  get slotCount(): number {
    return this._slots.length
  }

  clear(): void {
    this._slots = []
  }
}

export class BatchAggregationContext {
  private _pendingWrites: Map<string, { value: unknown; timestamp: number }> = new Map()
  private _changes: PantheonChanges = createPantheonChanges()
  private _committed = false

  stage<T>(key: string, value: T): void {
    if (this._committed) return
    const isNew = !this._pendingWrites.has(key)
    this._pendingWrites.set(key, { value, timestamp: Date.now() })
    if (isNew) {
      this._changes.added.add(key)
    } else {
      this._changes.updated.add(key)
    }
  }

  unstage(key: string): void {
    if (this._committed) return
    if (this._pendingWrites.delete(key)) {
      this._changes.removed.add(key)
    }
  }

  commit(): { entries: Map<string, { value: unknown; timestamp: number }>; changes: PantheonChanges } {
    this._committed = true
    return {
      entries: new Map(this._pendingWrites),
      changes: this._changes
    }
  }

  get pendingCount(): number {
    return this._pendingWrites.size
  }

  get isCommitted(): boolean {
    return this._committed
  }
}
