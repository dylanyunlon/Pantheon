import type {
  MatchHistoryGamesAnalysisAll,
  MatchHistoryGamesAnalysisTeamSide,
  AkariScore
} from '../analysis'
import { calculateAkariScore } from '../analysis'
import type { RankedStats } from '@shared/types/league-client/ranked'
import type { ParsedRole } from '../ranked'
import {
  aggregateTeamProfile,
  compareTeams
} from '../cache/aggregator'
import type { TeamComparisonResult, AggregatedTeamProfile } from '../cache/aggregator'
import type { GamePhase } from '../scheduler'

const TIER_ORDER: Record<string, number> = {
  IRON: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4,
  EMERALD: 5, DIAMOND: 6, MASTER: 7, GRANDMASTER: 8, CHALLENGER: 9
}
const DIVISION_ORDER: Record<string, number> = { IV: 0, III: 1, II: 2, I: 3 }

function rankToNumeric(tier: string, division: string): number {
  const t = TIER_ORDER[tier] ?? -1
  if (t < 0) return -1
  return t * 4 + (DIVISION_ORDER[division] ?? 0)
}

function extractRankNumeric(
  rankedStats: Record<string, { data: RankedStats }>,
  puuid: string
): number {
  const entry = rankedStats[puuid]
  if (!entry?.data?.queueMap?.RANKED_SOLO_5x5) return -1
  const solo = entry.data.queueMap.RANKED_SOLO_5x5
  if (!solo.tier || solo.tier === 'UNRANKED' || solo.tier === '') return -1
  return rankToNumeric(solo.tier, solo.division)
}

function extractRankLabel(
  rankedStats: Record<string, { data: RankedStats }>,
  puuid: string
): string {
  const entry = rankedStats[puuid]
  if (!entry?.data?.queueMap?.RANKED_SOLO_5x5) return '未定级'
  const solo = entry.data.queueMap.RANKED_SOLO_5x5
  if (!solo.tier || solo.tier === 'UNRANKED' || solo.tier === '') return '未定级'
  const tierCN: Record<string, string> = {
    IRON: '黑铁', BRONZE: '青铜', SILVER: '白银', GOLD: '黄金',
    PLATINUM: '铂金', EMERALD: '翡翠', DIAMOND: '钻石',
    MASTER: '大师', GRANDMASTER: '宗师', CHALLENGER: '王者'
  }
  return `${tierCN[solo.tier] || solo.tier}${solo.division}`
}

export interface PlayerRankEntry {
  puuid: string
  numeric: number
  label: string
}

export interface LaneMatchupEntry {
  selfPosition: string
  enemyPuuid: string
  enemyPosition: string
  laneRankGap: number
  enemyRank: PlayerRankEntry
}

export interface DamageProfile {
  physicalShare: number
  magicalShare: number
  trueShare: number
  sampleCount: number
}

export interface PremadeGroup {
  members: string[]
  size: number
  isEnemy: boolean
}

export interface PlayerScoreEntry {
  puuid: string
  score: AkariScore
}

export interface ProfileSnapshot {
  selfPuuid: string
  allyPuuids: string[]
  enemyPuuids: string[]
  gamePhase: GamePhase
  gameMode: string
  queueType: string

  teamComparison: TeamComparisonResult | null
  allyProfile: AggregatedTeamProfile | null
  enemyProfile: AggregatedTeamProfile | null

  rankMap: Map<string, PlayerRankEntry>
  selfRank: PlayerRankEntry
  highestEnemyRank: PlayerRankEntry | null
  rankGapMax: number
  laneMatchup: LaneMatchupEntry | null

  allyDamageProfile: DamageProfile
  enemyDamageProfile: DamageProfile

  premadeGroups: PremadeGroup[]
  premadeMaxSize: number

  allyScores: PlayerScoreEntry[]
  enemyScores: PlayerScoreEntry[]
  allyAvgScore: number
  enemyAvgScore: number
  scoreDiff: number

  profilingLatencyMs: number
}

export interface ProfilePassInput {
  playerStats: {
    players: Record<string, MatchHistoryGamesAnalysisAll>
    teams: Record<string, MatchHistoryGamesAnalysisTeamSide>
  }
  championSelections: Record<string, number>
  positionAssignments: Record<string, { position: string; role: ParsedRole | null }>
  rankedStats: Record<string, { data: RankedStats }>
  selfPuuid: string
  allyMembers: string[]
  enemyMembers: string[]
  gameMode: string
  queueType: string
  gamePhase: GamePhase
  inferredPremadeTeams: Record<string, string[][]>
}

function computeRankMap(
  puuids: string[],
  rankedStats: Record<string, { data: RankedStats }>
): Map<string, PlayerRankEntry> {
  const map = new Map<string, PlayerRankEntry>()
  for (const puuid of puuids) {
    map.set(puuid, {
      puuid,
      numeric: extractRankNumeric(rankedStats, puuid),
      label: extractRankLabel(rankedStats, puuid)
    })
  }
  return map
}

function findHighestRank(
  puuids: string[],
  rankMap: Map<string, PlayerRankEntry>
): PlayerRankEntry | null {
  let best: PlayerRankEntry | null = null
  for (const puuid of puuids) {
    const entry = rankMap.get(puuid)
    if (!entry || entry.numeric < 0) continue
    if (!best || entry.numeric > best.numeric) best = entry
  }
  return best
}

function computeDamageProfile(
  puuids: string[],
  players: Record<string, MatchHistoryGamesAnalysisAll>
): DamageProfile {
  let phys = 0
  let magic = 0
  let trueDmg = 0
  let count = 0
  for (const puuid of puuids) {
    const a = players[puuid]
    if (!a) continue
    phys += a.summary.averagePhysicalDamageDealtToChampionShareOfTeam
    magic += a.summary.averageMagicDamageDealtToChampionShareOfTeam
    trueDmg += a.summary.averageTrueDamageDealtToChampionShareOfTeam ?? 0
    count++
  }
  if (count === 0) return { physicalShare: 0, magicalShare: 0, trueShare: 0, sampleCount: 0 }
  return {
    physicalShare: phys / count,
    magicalShare: magic / count,
    trueShare: trueDmg / count,
    sampleCount: count
  }
}

function detectPremadeGroups(
  inferredPremadeTeams: Record<string, string[][]>,
  enemyPuuids: string[]
): { groups: PremadeGroup[]; maxSize: number } {
  const groups: PremadeGroup[] = []
  let maxSize = 0
  const enemySet = new Set(enemyPuuids)
  for (const [, teamGroups] of Object.entries(inferredPremadeTeams)) {
    for (const members of teamGroups) {
      if (members.length < 2) continue
      const isEnemy = members.some(p => enemySet.has(p))
      groups.push({ members, size: members.length, isEnemy })
      if (members.length > maxSize) maxSize = members.length
    }
  }
  return { groups, maxSize }
}

function computePlayerScores(
  puuids: string[],
  players: Record<string, MatchHistoryGamesAnalysisAll>
): { entries: PlayerScoreEntry[]; total: number; count: number } {
  const entries: PlayerScoreEntry[] = []
  let total = 0
  let count = 0
  for (const puuid of puuids) {
    const analysis = players[puuid]
    if (!analysis) continue
    const score = calculateAkariScore(analysis)
    entries.push({ puuid, score })
    total += score.total
    count++
  }
  return { entries, total, count }
}

function findLaneMatchup(
  selfPuuid: string,
  enemyPuuids: string[],
  positionAssignments: Record<string, { position: string; role: ParsedRole | null }>,
  rankMap: Map<string, PlayerRankEntry>
): LaneMatchupEntry | null {
  const selfAssignment = positionAssignments[selfPuuid]
  if (!selfAssignment?.position) return null
  const selfRank = rankMap.get(selfPuuid)
  if (!selfRank || selfRank.numeric < 0) return null

  for (const puuid of enemyPuuids) {
    const assignment = positionAssignments[puuid]
    if (!assignment?.position || assignment.position !== selfAssignment.position) continue
    const enemyRank = rankMap.get(puuid)
    if (!enemyRank) continue
    return {
      selfPosition: selfAssignment.position,
      enemyPuuid: puuid,
      enemyPosition: assignment.position,
      laneRankGap: enemyRank.numeric >= 0 ? enemyRank.numeric - selfRank.numeric : 0,
      enemyRank
    }
  }
  return null
}

export function runProfilePass(input: ProfilePassInput): ProfileSnapshot {
  const start = Date.now()

  const allAlly = [input.selfPuuid, ...input.allyMembers.filter(p => p !== input.selfPuuid)]

  const teamComparison = compareTeams(
    allAlly,
    input.enemyMembers,
    input.playerStats.players
  )
  const allyProfile = aggregateTeamProfile(allAlly, input.playerStats.players)
  const enemyProfile = aggregateTeamProfile(input.enemyMembers, input.playerStats.players)

  const allPuuids = [...allAlly, ...input.enemyMembers]
  const rankMap = computeRankMap(allPuuids, input.rankedStats)
  const selfRank = rankMap.get(input.selfPuuid) || { puuid: input.selfPuuid, numeric: -1, label: '未定级' }
  const highestEnemyRank = findHighestRank(input.enemyMembers, rankMap)

  let rankGapMax = 0
  if (selfRank.numeric >= 0) {
    for (const puuid of input.enemyMembers) {
      const er = rankMap.get(puuid)
      if (!er || er.numeric < 0) continue
      const gap = Math.abs(er.numeric - selfRank.numeric)
      if (gap > rankGapMax) rankGapMax = gap
    }
  }

  const laneMatchup = findLaneMatchup(
    input.selfPuuid,
    input.enemyMembers,
    input.positionAssignments,
    rankMap
  )

  const allyDamageProfile = computeDamageProfile(allAlly, input.playerStats.players)
  const enemyDamageProfile = computeDamageProfile(input.enemyMembers, input.playerStats.players)

  const { groups: premadeGroups, maxSize: premadeMaxSize } = detectPremadeGroups(
    input.inferredPremadeTeams,
    input.enemyMembers
  )

  const allyScoreResult = computePlayerScores(allAlly, input.playerStats.players)
  const enemyScoreResult = computePlayerScores(input.enemyMembers, input.playerStats.players)
  const allyAvg = allyScoreResult.count > 0 ? allyScoreResult.total / allyScoreResult.count : 0
  const enemyAvg = enemyScoreResult.count > 0 ? enemyScoreResult.total / enemyScoreResult.count : 0

  return {
    selfPuuid: input.selfPuuid,
    allyPuuids: allAlly.filter(p => p !== input.selfPuuid),
    enemyPuuids: input.enemyMembers,
    gamePhase: input.gamePhase,
    gameMode: input.gameMode,
    queueType: input.queueType,

    teamComparison,
    allyProfile,
    enemyProfile,

    rankMap,
    selfRank,
    highestEnemyRank,
    rankGapMax,
    laneMatchup,

    allyDamageProfile,
    enemyDamageProfile,

    premadeGroups,
    premadeMaxSize,

    allyScores: allyScoreResult.entries,
    enemyScores: enemyScoreResult.entries,
    allyAvgScore: allyAvg,
    enemyAvgScore: enemyAvg,
    scoreDiff: allyAvg - enemyAvg,

    profilingLatencyMs: Date.now() - start
  }
}
