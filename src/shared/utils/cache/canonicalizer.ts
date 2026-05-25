
export interface PantheonCacheKeyParams {
  selfPuuid: string
  championSelections: Record<string, number>
  gameMode: string
    rankedAvailability: string[]
    analysisAvailability: string[]
    gamePhase?: string
    positionAvailability?: string[]
}

export function canonicalizeCacheKey(params: PantheonCacheKeyParams): string {
  const champEntries = Object.entries(params.championSelections)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join(',')

  const rankedSorted = [...params.rankedAvailability].sort().join(',')
  const analysisSorted = [...params.analysisAvailability].sort().join(',')

  const posSorted = params.positionAvailability ? [...params.positionAvailability].sort().join(',') : ''
  const phase = params.gamePhase || ''
  return `${params.selfPuuid}|${champEntries}|${params.gameMode}|r:${rankedSorted}|a:${analysisSorted}|p:${posSorted}|ph:${phase}`
}

export function computeDataCompleteness(params: PantheonCacheKeyParams): number {
  const totalPlayers = Object.keys(params.championSelections).length
  if (totalPlayers === 0) return 0

  const analysisRatio = params.analysisAvailability.length / totalPlayers
  const rankedRatio = params.rankedAvailability.length / totalPlayers

  const posRatio = params.positionAvailability ? params.positionAvailability.length / totalPlayers : 0
  return Math.round(analysisRatio * 55 + rankedRatio * 25 + posRatio * 20)
}

export function shouldReplace(
  existingCompleteness: number,
  newCompleteness: number,
  existingTimestamp: number,
  maxAge: number
): boolean {
  const isExpired = Date.now() - existingTimestamp >= maxAge
  if (isExpired) return true
  if (newCompleteness > existingCompleteness) return true
  return false
}
