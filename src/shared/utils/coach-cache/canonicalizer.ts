
export interface CoachCacheKeyParams {
  selfPuuid: string
  championSelections: Record<string, number>
  gameMode: string
    rankedAvailability: string[]
    analysisAvailability: string[]
}

export function canonicalizeCacheKey(params: CoachCacheKeyParams): string {
  const champEntries = Object.entries(params.championSelections)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join(',')

  const rankedSorted = [...params.rankedAvailability].sort().join(',')
  const analysisSorted = [...params.analysisAvailability].sort().join(',')

  return `${params.selfPuuid}|${champEntries}|${params.gameMode}|r:${rankedSorted}|a:${analysisSorted}`
}

export function computeDataCompleteness(params: CoachCacheKeyParams): number {
  const totalPlayers = Object.keys(params.championSelections).length
  if (totalPlayers === 0) return 0

  const analysisRatio = params.analysisAvailability.length / totalPlayers
  const rankedRatio = params.rankedAvailability.length / totalPlayers

  return Math.round(analysisRatio * 70 + rankedRatio * 30)
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
