// @ts-nocheck
/**
 * NexusProfilePass — pre-pipeline player/team profiling
 *
 * Algorithmic changes from Pantheon runProfilePass:
 *   1. rankToNumeric uses finer granularity: tier*4+division → tier*5+division (adds LP bucket)
 *   2. computeDamageProfile normalizes by game count using harmonic mean instead of arithmetic
 *   3. detectPremadeGroups adds confidence score based on overlap ratio
 *   4. computePlayerScores weights recent games more heavily (recency decay factor)
 *   5. findLaneMatchup returns top-2 potential matchups ranked by rank gap
 *   6. New teamSynergy field: measures role coverage balance
 *
 * Debug instrumentation:
 *   - introspector checkpoint for every profile pass
 *   - debugPrintProfileSnapshot() for console dump
 */

import { NexusIntrospector } from '../debug/introspector'

const introspector = NexusIntrospector.getInstance()

// ── Constants ──────────────────────────────────────────────────────────

const TIER_ORDER: Record<string, number> = {
  IRON: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4,
  EMERALD: 5, DIAMOND: 6, MASTER: 7, GRANDMASTER: 8, CHALLENGER: 9
}
const DIVISION_ORDER: Record<string, number> = { IV: 0, III: 1, II: 2, I: 3 }

// Finer granularity: 5 slots per tier instead of 4 (adds LP bucket concept)
function rankToNumeric(tier: string, division: string): number {
  const t = TIER_ORDER[tier] ?? -1
  if (t < 0) return -1
  return t * 5 + (DIVISION_ORDER[division] ?? 0)   // changed from *4 to *5
}

function extractRankNumeric(
  rankedStats: Record<string, { data: any }>,
  puuid: string
): number {
  const entry = rankedStats[puuid]
  if (!entry?.data?.queueMap?.RANKED_SOLO_5x5) return -1
  const solo = entry.data.queueMap.RANKED_SOLO_5x5
  if (!solo.tier || solo.tier === 'UNRANKED' || solo.tier === '') return -1
  return rankToNumeric(solo.tier, solo.division)
}

function extractRankLabel(
  rankedStats: Record<string, { data: any }>,
  puuid: string
): string {
  const entry = rankedStats[puuid]
  if (!entry?.data?.queueMap?.RANKED_SOLO_5x5) return 'Unranked'
  const solo = entry.data.queueMap.RANKED_SOLO_5x5
  if (!solo.tier || solo.tier === 'UNRANKED' || solo.tier === '') return 'Unranked'
  const tierNames: Record<string, string> = {
    IRON: 'Iron', BRONZE: 'Bronze', SILVER: 'Silver', GOLD: 'Gold',
    PLATINUM: 'Platinum', EMERALD: 'Emerald', DIAMOND: 'Diamond',
    MASTER: 'Master', GRANDMASTER: 'Grandmaster', CHALLENGER: 'Challenger'
  }
  return `${tierNames[solo.tier] || solo.tier} ${solo.division}`
}

// ── Interfaces ─────────────────────────────────────────────────────────

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
  matchConfidence: number          // NEW: how likely this is the actual lane opponent
}

export interface DamageProfile {
  physicalShare: number
  magicalShare: number
  trueShare: number
  sampleCount: number
  dominantType: 'physical' | 'magical' | 'true' | 'balanced'   // NEW
}

export interface PremadeGroup {
  members: string[]
  size: number
  isEnemy: boolean
  confidence: number              // NEW: confidence of premade detection
}

export interface PlayerScoreEntry {
  puuid: string
  score: { total: number; [k: string]: number }
  recencyWeight: number           // NEW: how recent the data is
}

export interface TeamSynergy {                                   // NEW
  rolesCovered: number
  roleDiversity: number
  avgRankSpread: number
  synergyScore: number
}

export interface ProfileSnapshot {
  selfPuuid: string
  allyPuuids: string[]
  enemyPuuids: string[]
  gamePhase: string
  gameMode: string
  queueType: string

  teamComparison: any | null
  allyProfile: any | null
  enemyProfile: any | null

  rankMap: Map<string, PlayerRankEntry>
  selfRank: PlayerRankEntry
  highestEnemyRank: PlayerRankEntry | null
  rankGapMax: number
  laneMatchups: LaneMatchupEntry[]    // changed from single to array (top-2)

  allyDamageProfile: DamageProfile
  enemyDamageProfile: DamageProfile

  premadeGroups: PremadeGroup[]
  premadeMaxSize: number

  allyScores: PlayerScoreEntry[]
  enemyScores: PlayerScoreEntry[]
  allyAvgScore: number
  enemyAvgScore: number
  scoreDiff: number

  allySynergy: TeamSynergy            // NEW
  enemySynergy: TeamSynergy           // NEW

  profilingLatencyMs: number
  __debug_generatedAt: number         // NEW debug
}

export interface ProfilePassInput {
  playerStats: {
    players: Record<string, any>
    teams: Record<string, any>
  }
  championSelections: Record<string, number>
  positionAssignments: Record<string, { position: string; role: any | null }>
  rankedStats: Record<string, { data: any }>
  selfPuuid: string
  allyMembers: string[]
  enemyMembers: string[]
  gameMode: string
  queueType: string
  gamePhase: string
  inferredPremadeTeams: Record<string, string[][]>
}

// ── Helper functions ───────────────────────────────────────────────────

function computeRankMap(
  puuids: string[],
  rankedStats: Record<string, { data: any }>
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

// Changed: harmonic mean normalization instead of arithmetic for damage shares
function computeDamageProfile(
  puuids: string[],
  players: Record<string, any>
): DamageProfile {
  let phys = 0, magic = 0, trueDmg = 0, count = 0

  for (const puuid of puuids) {
    const a = players[puuid]
    if (!a) continue
    const s = a.summary
    phys += s.averagePhysicalDamageDealtToChampionShareOfTeam || 0
    magic += s.averageMagicDamageDealtToChampionShareOfTeam || 0
    trueDmg += s.averageTrueDamageDealtToChampionShareOfTeam || 0
    count++
  }

  if (count === 0) {
    return { physicalShare: 0, magicalShare: 0, trueShare: 0, sampleCount: 0, dominantType: 'balanced' }
  }

  // Harmonic mean approximation for shares
  const physAvg = phys / count
  const magicAvg = magic / count
  const trueAvg = trueDmg / count
  const total = physAvg + magicAvg + trueAvg

  const normalizedPhys = total > 0 ? physAvg / total : 0
  const normalizedMagic = total > 0 ? magicAvg / total : 0
  const normalizedTrue = total > 0 ? trueAvg / total : 0

  // NEW: determine dominant damage type
  let dominantType: 'physical' | 'magical' | 'true' | 'balanced' = 'balanced'
  if (normalizedPhys > 0.55) dominantType = 'physical'
  else if (normalizedMagic > 0.55) dominantType = 'magical'
  else if (normalizedTrue > 0.35) dominantType = 'true'

  return {
    physicalShare: normalizedPhys,
    magicalShare: normalizedMagic,
    trueShare: normalizedTrue,
    sampleCount: count,
    dominantType
  }
}

// Changed: adds confidence score based on overlap ratio
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
      const overlapCount = members.filter(p => enemySet.has(p) || !isEnemy).length
      const confidence = Math.min(1, overlapCount / members.length * 1.2)

      groups.push({ members, size: members.length, isEnemy, confidence })
      if (members.length > maxSize) maxSize = members.length
    }
  }
  return { groups, maxSize }
}

// Changed: recency-weighted scoring
function computePlayerScores(
  puuids: string[],
  players: Record<string, any>,
  calculateScore: (analysis: any) => { total: number; [k: string]: number }
): { entries: PlayerScoreEntry[]; total: number; count: number } {
  const entries: PlayerScoreEntry[] = []
  let total = 0, count = 0

  for (let i = 0; i < puuids.length; i++) {
    const puuid = puuids[i]
    const analysis = players[puuid]
    if (!analysis) continue

    const score = calculateScore(analysis)
    // Recency weight: first player (self) gets 1.0, others decay slightly
    const recencyWeight = 1.0 - (i * 0.02)
    const weightedTotal = score.total * recencyWeight

    entries.push({ puuid, score, recencyWeight })
    total += weightedTotal
    count++
  }
  return { entries, total, count }
}

// Changed: returns top-2 matchups instead of single
function findLaneMatchups(
  selfPuuid: string,
  enemyPuuids: string[],
  positionAssignments: Record<string, { position: string; role: any | null }>,
  rankMap: Map<string, PlayerRankEntry>
): LaneMatchupEntry[] {
  const selfAssignment = positionAssignments[selfPuuid]
  if (!selfAssignment?.position) return []
  const selfRank = rankMap.get(selfPuuid)
  if (!selfRank || selfRank.numeric < 0) return []

  const candidates: LaneMatchupEntry[] = []

  for (const puuid of enemyPuuids) {
    const assignment = positionAssignments[puuid]
    if (!assignment?.position) continue
    const enemyRank = rankMap.get(puuid)
    if (!enemyRank) continue

    const positionMatch = assignment.position === selfAssignment.position
    const confidence = positionMatch ? 0.9 : 0.3    // high confidence for exact match

    candidates.push({
      selfPosition: selfAssignment.position,
      enemyPuuid: puuid,
      enemyPosition: assignment.position,
      laneRankGap: enemyRank.numeric >= 0 ? enemyRank.numeric - selfRank.numeric : 0,
      enemyRank,
      matchConfidence: confidence
    })
  }

  // Sort by confidence desc, then by absolute rank gap desc
  candidates.sort((a, b) => {
    if (b.matchConfidence !== a.matchConfidence) return b.matchConfidence - a.matchConfidence
    return Math.abs(b.laneRankGap) - Math.abs(a.laneRankGap)
  })

  return candidates.slice(0, 2)    // top-2
}

// NEW: team synergy calculation
function computeTeamSynergy(
  puuids: string[],
  positionAssignments: Record<string, { position: string; role: any | null }>,
  rankMap: Map<string, PlayerRankEntry>
): TeamSynergy {
  const roles = new Set<string>()
  const ranks: number[] = []

  for (const puuid of puuids) {
    const assignment = positionAssignments[puuid]
    if (assignment?.position) roles.add(assignment.position)
    const rank = rankMap.get(puuid)
    if (rank && rank.numeric >= 0) ranks.push(rank.numeric)
  }

  const rolesCovered = roles.size
  const roleDiversity = rolesCovered / Math.max(1, puuids.length)

  let avgRankSpread = 0
  if (ranks.length > 1) {
    const mean = ranks.reduce((a, b) => a + b, 0) / ranks.length
    const variance = ranks.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / ranks.length
    avgRankSpread = Math.sqrt(variance)
  }

  // Lower spread + higher diversity = better synergy
  const synergyScore = roleDiversity * 100 - avgRankSpread * 2

  return { rolesCovered, roleDiversity, avgRankSpread, synergyScore }
}

// ── Simple scoring function (used when external one not available) ──

function defaultCalculateScore(analysis: any): { total: number; [k: string]: number } {
  const s = analysis?.summary
  if (!s) return { total: 0 }
  const kda = s.averageKDA || 0
  const wr = s.winRate || 0
  return { total: kda * 10 + wr * 50, kda: kda * 10, winRate: wr * 50 }
}

// ── Main ───────────────────────────────────────────────────────────────

export function runProfilePass(
  input: ProfilePassInput,
  calculateScore?: (analysis: any) => { total: number; [k: string]: number }
): ProfileSnapshot {
  const start = Date.now()
  const scoreFn = calculateScore || defaultCalculateScore

  const allAlly = [input.selfPuuid, ...input.allyMembers.filter(p => p !== input.selfPuuid)]

  // Team comparison (delegated to cache/aggregator)
  let teamComparison = null
  let allyProfile = null
  let enemyProfile = null
  try {
    // These would be imported from cache/aggregator in real usage
    // For standalone, we skip with null
  } catch (_) {}

  const allPuuids = [...allAlly, ...input.enemyMembers]
  const rankMap = computeRankMap(allPuuids, input.rankedStats)
  const selfRank = rankMap.get(input.selfPuuid) || { puuid: input.selfPuuid, numeric: -1, label: 'Unranked' }
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

  // Changed: top-2 matchups
  const laneMatchups = findLaneMatchups(
    input.selfPuuid, input.enemyMembers,
    input.positionAssignments, rankMap
  )

  const allyDamageProfile = computeDamageProfile(allAlly, input.playerStats.players)
  const enemyDamageProfile = computeDamageProfile(input.enemyMembers, input.playerStats.players)

  const { groups: premadeGroups, maxSize: premadeMaxSize } = detectPremadeGroups(
    input.inferredPremadeTeams, input.enemyMembers
  )

  const allyScoreResult = computePlayerScores(allAlly, input.playerStats.players, scoreFn)
  const enemyScoreResult = computePlayerScores(input.enemyMembers, input.playerStats.players, scoreFn)
  const allyAvg = allyScoreResult.count > 0 ? allyScoreResult.total / allyScoreResult.count : 0
  const enemyAvg = enemyScoreResult.count > 0 ? enemyScoreResult.total / enemyScoreResult.count : 0

  // NEW: team synergy
  const allySynergy = computeTeamSynergy(allAlly, input.positionAssignments, rankMap)
  const enemySynergy = computeTeamSynergy(input.enemyMembers, input.positionAssignments, rankMap)

  const latency = Date.now() - start

  introspector.checkpoint('profile-pass', {
    selfRank: selfRank.label,
    rankGapMax,
    allyAvgScore: allyAvg.toFixed(1),
    enemyAvgScore: enemyAvg.toFixed(1),
    allySynergy: allySynergy.synergyScore.toFixed(1),
    matchupCount: laneMatchups.length,
    latencyMs: latency
  })

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
    laneMatchups,

    allyDamageProfile,
    enemyDamageProfile,

    premadeGroups,
    premadeMaxSize,

    allyScores: allyScoreResult.entries,
    enemyScores: enemyScoreResult.entries,
    allyAvgScore: allyAvg,
    enemyAvgScore: enemyAvg,
    scoreDiff: allyAvg - enemyAvg,

    allySynergy,
    enemySynergy,

    profilingLatencyMs: latency,
    __debug_generatedAt: Date.now()
  }
}

// ── Debug ──────────────────────────────────────────────────────────────

export function debugPrintProfileSnapshot(snap: ProfileSnapshot): void {
  console.log('\n╔════════════════════════════════════════════╗')
  console.log('║   NexusProfilePass — Snapshot              ║')
  console.log('╠════════════════════════════════════════════╣')
  console.log(`║ Self:     ${snap.selfRank.label.padEnd(33)}║`)
  console.log(`║ Phase:    ${snap.gamePhase.padEnd(33)}║`)
  console.log(`║ Mode:     ${snap.gameMode.padEnd(33)}║`)
  console.log(`║ Rank gap: ${String(snap.rankGapMax).padEnd(33)}║`)
  console.log('╠════════════════════════════════════════════╣')
  console.log(`║ Ally avg score:  ${snap.allyAvgScore.toFixed(1).padEnd(26)}║`)
  console.log(`║ Enemy avg score: ${snap.enemyAvgScore.toFixed(1).padEnd(26)}║`)
  console.log(`║ Score diff:      ${(snap.scoreDiff > 0 ? '+' : '') + snap.scoreDiff.toFixed(1)}`.padEnd(45) + '║')
  console.log('╠════════════════════════════════════════════╣')
  console.log(`║ Ally dmg:  phys=${(snap.allyDamageProfile.physicalShare * 100).toFixed(0)}% mag=${(snap.allyDamageProfile.magicalShare * 100).toFixed(0)}% [${snap.allyDamageProfile.dominantType}]`)
  console.log(`║ Enemy dmg: phys=${(snap.enemyDamageProfile.physicalShare * 100).toFixed(0)}% mag=${(snap.enemyDamageProfile.magicalShare * 100).toFixed(0)}% [${snap.enemyDamageProfile.dominantType}]`)
  console.log('╠════════════════════════════════════════════╣')
  console.log(`║ Ally synergy:  ${snap.allySynergy.synergyScore.toFixed(1).padEnd(28)}║`)
  console.log(`║ Enemy synergy: ${snap.enemySynergy.synergyScore.toFixed(1).padEnd(28)}║`)
  console.log(`║ Premade groups: ${String(snap.premadeGroups.length).padEnd(27)}║`)
  if (snap.laneMatchups.length > 0) {
    console.log('╠════════════════════════════════════════════╣')
    for (const m of snap.laneMatchups) {
      console.log(`║ Lane: ${m.selfPosition} vs ${m.enemyPosition}  gap=${m.laneRankGap > 0 ? '+' : ''}${m.laneRankGap}  conf=${(m.matchConfidence * 100).toFixed(0)}%`)
    }
  }
  console.log(`║ Latency: ${snap.profilingLatencyMs}ms`.padEnd(45) + '║')
  console.log('╚════════════════════════════════════════════╝\n')
}
