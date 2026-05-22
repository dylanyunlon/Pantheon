import type { CoachAdvice, CoachAdviceType, CoachAdvicePriority } from '../coach-engine'
import type { GamePhase } from '../coach-scheduler'
import type {
  FeatureVector,
  TrainingSample,
  CaptureEvent,
  CaptureSessionMeta
} from '../coach-capture/experiment-capture'
import type { GameclientEogStatsBlock } from '@shared/types/league-client/end-of-game'

export interface PostGamePlayerStats {
  puuid: string
  championId: number
  kills: number
  deaths: number
  assists: number
  kda: number
  goldEarned: number
  damageDealt: number
  damageDealtToChampions: number
  damageTaken: number
  items: number[]
  championLevel: number
  subteamId: number
  subteamStanding: number
}

export interface ReplayOutcome {
  gameId: number
  selfPuuid: string
  outcome: 'win' | 'loss' | 'unknown'
  selfStats: PostGamePlayerStats | null
  gameDurationSeconds: number
  gameMode: string
  queueType: string
  isRanked: boolean
  allPlayers: PostGamePlayerStats[]
  selfTeamPlayers: PostGamePlayerStats[]
  enemyTeamPlayers: PostGamePlayerStats[]
  resolvedAt: number
}

export interface AdviceAccuracyRecord {
  adviceType: CoachAdviceType
  title: string
  confidence: number
  phase: string
  wasAccurate: boolean
  accuracyScore: number
  reasoning: string[]
}

export interface ReplayAnalysisReport {
  gameId: number
  sessionId: string
  outcome: ReplayOutcome
  backfilledSamples: number
  adviceAccuracy: AdviceAccuracyRecord[]
  overallAccuracy: number
  performanceDelta: PerformanceDelta
  analyzedAt: number
}

export interface PerformanceDelta {
  predictedDelta: number
  actualDelta: number
  predictionError: number
  selfKdaVsExpected: number
  selfDamageVsExpected: number
  selfGoldVsExpected: number
}

function parseEogStats(
  eog: GameclientEogStatsBlock,
  selfPuuid: string
): { selfStats: PostGamePlayerStats | null; allPlayers: PostGamePlayerStats[] } {
  const allPlayers: PostGamePlayerStats[] = []
  let selfStats: PostGamePlayerStats | null = null

  for (const p of eog.statsBlock.players) {
    const stats: PostGamePlayerStats = {
      puuid: p.PUUID,
      championId: p.championId,
      kills: p.playerKills,
      deaths: p.playerDeaths,
      assists: p.playerAssists,
      kda: p.playerDeaths > 0
        ? (p.playerKills + p.playerAssists) / p.playerDeaths
        : p.playerKills + p.playerAssists,
      goldEarned: p.goldEarned,
      damageDealt: p.damageDealt,
      damageDealtToChampions: p.damageDealtToChampions,
      damageTaken: p.damageTaken,
      items: p.itemIds,
      championLevel: p.championLevel,
      subteamId: p.subteamId,
      subteamStanding: p.subteamStanding
    }
    allPlayers.push(stats)
    if (p.PUUID === selfPuuid) {
      selfStats = stats
    }
  }

  return { selfStats, allPlayers }
}

function determineOutcome(
  selfStats: PostGamePlayerStats | null,
  allPlayers: PostGamePlayerStats[]
): 'win' | 'loss' | 'unknown' {
  if (!selfStats) return 'unknown'
  if (selfStats.subteamStanding === 1) return 'win'
  if (selfStats.subteamStanding > 1) return 'loss'
  return 'unknown'
}

function splitTeams(
  allPlayers: PostGamePlayerStats[],
  selfStats: PostGamePlayerStats | null
): { selfTeam: PostGamePlayerStats[]; enemyTeam: PostGamePlayerStats[] } {
  if (!selfStats) return { selfTeam: [], enemyTeam: allPlayers }
  const selfTeam = allPlayers.filter(p => p.subteamId === selfStats.subteamId)
  const enemyTeam = allPlayers.filter(p => p.subteamId !== selfStats.subteamId)
  return { selfTeam, enemyTeam }
}

function computeTeamAvg(
  players: PostGamePlayerStats[],
  field: keyof PostGamePlayerStats
): number {
  if (players.length === 0) return 0
  return players.reduce((s, p) => s + (p[field] as number), 0) / players.length
}

function scoreAdviceAccuracy(
  advice: CoachAdvice,
  outcome: 'win' | 'loss' | 'unknown',
  selfStats: PostGamePlayerStats | null,
  selfTeam: PostGamePlayerStats[],
  enemyTeam: PostGamePlayerStats[]
): AdviceAccuracyRecord {
  const reasoning: string[] = []
  let wasAccurate = false
  let accuracyScore = 0.5

  if (!selfStats || outcome === 'unknown') {
    return {
      adviceType: advice.type,
      title: advice.title,
      confidence: advice.confidence,
      phase: '',
      wasAccurate: false,
      accuracyScore: 0.5,
      reasoning: ['insufficient_data']
    }
  }

  switch (advice.type) {
    case 'enemy_weakness' as CoachAdviceType:
      if (outcome === 'win') {
        wasAccurate = true
        accuracyScore = 0.7
        reasoning.push('game_won_enemy_exploited')
      } else {
        accuracyScore = 0.3
        reasoning.push('game_lost_enemy_not_weak_enough')
      }
      break

    case 'macro_strategy' as CoachAdviceType:
      if (advice.message.includes('占优') || advice.message.includes('advantage')) {
        wasAccurate = outcome === 'win'
        accuracyScore = outcome === 'win' ? 0.8 : 0.2
        reasoning.push(outcome === 'win' ? 'team_advantage_confirmed' : 'team_advantage_overestimated')
      } else if (advice.message.includes('略强') || advice.message.includes('disadvantage')) {
        wasAccurate = outcome === 'loss'
        accuracyScore = outcome === 'loss' ? 0.7 : 0.4
        reasoning.push(outcome === 'loss' ? 'team_disadvantage_confirmed' : 'team_overcame_disadvantage')
      } else {
        accuracyScore = 0.5
        reasoning.push('balanced_prediction')
      }
      break

    case 'mental' as CoachAdviceType:
      if (advice.message.includes('连败') || advice.message.includes('losing')) {
        wasAccurate = outcome === 'loss'
        accuracyScore = outcome === 'loss' ? 0.6 : 0.7
        reasoning.push(outcome === 'win' ? 'mental_recovery_succeeded' : 'streak_continued')
      } else {
        wasAccurate = outcome === 'win'
        accuracyScore = outcome === 'win' ? 0.7 : 0.4
        reasoning.push(outcome === 'win' ? 'positive_mental_confirmed' : 'streak_broken')
      }
      break

    case 'lane_matchup' as CoachAdviceType:
      wasAccurate = selfStats.kda >= 2.0
      accuracyScore = Math.min(1.0, selfStats.kda / 5.0)
      reasoning.push(`self_kda=${selfStats.kda.toFixed(2)}`)
      break

    case 'composition' as CoachAdviceType: {
      const teamDmg = computeTeamAvg(selfTeam, 'damageDealtToChampions')
      const enemyDmg = computeTeamAvg(enemyTeam, 'damageDealtToChampions')
      wasAccurate = teamDmg > enemyDmg
      accuracyScore = teamDmg > 0 ? Math.min(1.0, teamDmg / (teamDmg + enemyDmg)) : 0.5
      reasoning.push(`team_dmg_ratio=${accuracyScore.toFixed(2)}`)
      break
    }

    case 'risk_warning' as CoachAdviceType:
      wasAccurate = outcome === 'loss'
      accuracyScore = outcome === 'loss' ? 0.7 : 0.5
      reasoning.push(outcome === 'loss' ? 'risk_materialized' : 'risk_managed')
      break

    case 'laning_phase' as CoachAdviceType:
      if (selfStats.goldEarned > computeTeamAvg(enemyTeam, 'goldEarned')) {
        wasAccurate = true
        accuracyScore = 0.7
        reasoning.push('laning_gold_advantage')
      } else {
        accuracyScore = 0.4
        reasoning.push('laning_gold_deficit')
      }
      break

    case 'vision' as CoachAdviceType:
      wasAccurate = outcome === 'win'
      accuracyScore = outcome === 'win' ? 0.6 : 0.4
      reasoning.push('vision_advice_outcome_correlated')
      break

    case 'itemization_hint' as CoachAdviceType:
      wasAccurate = selfStats.damageDealtToChampions > computeTeamAvg(selfTeam, 'damageDealtToChampions')
      accuracyScore = wasAccurate ? 0.7 : 0.4
      reasoning.push(`self_dmg_above_avg=${wasAccurate}`)
      break

    default:
      accuracyScore = outcome === 'win' ? 0.6 : 0.4
      wasAccurate = outcome === 'win'
      reasoning.push('default_outcome_correlation')
  }

  return {
    adviceType: advice.type,
    title: advice.title,
    confidence: advice.confidence,
    phase: '',
    wasAccurate,
    accuracyScore,
    reasoning
  }
}

export class ReplayAnalysisPipeline {
  private _reports: ReplayAnalysisReport[] = []
  private _maxReports = 50
  private _onReportListeners = new Set<(report: ReplayAnalysisReport) => void>()

  analyzeReplay(params: {
    eogStats: GameclientEogStatsBlock
    selfPuuid: string
    sessionId: string
    advicesGiven: CoachAdvice[]
    pendingSamples: TrainingSample[]
    featureVector: FeatureVector | null
    teamComparison: { overallDelta: number } | null
  }): ReplayAnalysisReport {
    const { selfStats, allPlayers } = parseEogStats(params.eogStats, params.selfPuuid)
    const outcome = determineOutcome(selfStats, allPlayers)
    const { selfTeam, enemyTeam } = splitTeams(allPlayers, selfStats)

    const replayOutcome: ReplayOutcome = {
      gameId: params.eogStats.gameId,
      selfPuuid: params.selfPuuid,
      outcome,
      selfStats,
      gameDurationSeconds: params.eogStats.statsBlock.gameLengthSeconds,
      gameMode: params.eogStats.gameMode,
      queueType: params.eogStats.queueType,
      isRanked: params.eogStats.isRanked,
      allPlayers,
      selfTeamPlayers: selfTeam,
      enemyTeamPlayers: enemyTeam,
      resolvedAt: Date.now()
    }

    let backfilledCount = 0
    for (const sample of params.pendingSamples) {
      if (sample.outcome === 'pending' && sample.sessionId === params.sessionId) {
        sample.outcome = outcome
        backfilledCount++
      }
    }

    const adviceAccuracy = params.advicesGiven.map(advice =>
      scoreAdviceAccuracy(advice, outcome, selfStats, selfTeam, enemyTeam)
    )

    const overallAccuracy = adviceAccuracy.length > 0
      ? adviceAccuracy.reduce((s, a) => s + a.accuracyScore, 0) / adviceAccuracy.length
      : 0

    const predictedDelta = params.teamComparison?.overallDelta ?? 0
    let actualDelta = 0
    if (selfTeam.length > 0 && enemyTeam.length > 0) {
      const selfTeamKda = computeTeamAvg(selfTeam, 'kda')
      const enemyTeamKda = computeTeamAvg(enemyTeam, 'kda')
      actualDelta = (selfTeamKda - enemyTeamKda) / Math.max(selfTeamKda + enemyTeamKda, 1)
    }

    const performanceDelta: PerformanceDelta = {
      predictedDelta,
      actualDelta,
      predictionError: Math.abs(predictedDelta - actualDelta),
      selfKdaVsExpected: selfStats
        ? selfStats.kda - (params.featureVector?.selfKda ?? 0)
        : 0,
      selfDamageVsExpected: selfStats
        ? selfStats.damageDealtToChampions / Math.max(params.eogStats.statsBlock.gameLengthSeconds / 60, 1)
          - (params.featureVector?.selfDamageShare ?? 0) * 10000
        : 0,
      selfGoldVsExpected: 0
    }

    const report: ReplayAnalysisReport = {
      gameId: params.eogStats.gameId,
      sessionId: params.sessionId,
      outcome: replayOutcome,
      backfilledSamples: backfilledCount,
      adviceAccuracy,
      overallAccuracy,
      performanceDelta,
      analyzedAt: Date.now()
    }

    if (this._reports.length >= this._maxReports) {
      this._reports.shift()
    }
    this._reports.push(report)

    for (const listener of this._onReportListeners) {
      try { listener(report) } catch (_) {}
    }

    return report
  }

  backfillOutcome(
    samples: TrainingSample[],
    sessionId: string,
    outcome: 'win' | 'loss' | 'unknown'
  ): number {
    let count = 0
    for (const s of samples) {
      if (s.sessionId === sessionId && s.outcome === 'pending') {
        s.outcome = outcome
        count++
      }
    }
    return count
  }

  getReports(): ReplayAnalysisReport[] {
    return [...this._reports]
  }

  getReport(gameId: number): ReplayAnalysisReport | null {
    return this._reports.find(r => r.gameId === gameId) || null
  }

  getLatestReport(): ReplayAnalysisReport | null {
    return this._reports.length > 0 ? this._reports[this._reports.length - 1] : null
  }

  onReport(listener: (report: ReplayAnalysisReport) => void): () => void {
    this._onReportListeners.add(listener)
    return () => { this._onReportListeners.delete(listener) }
  }

  getAccuracyHistory(adviceType?: CoachAdviceType): {
    totalReports: number
    avgAccuracy: number
    accuracyByType: Record<string, { avg: number; count: number }>
    winCorrelation: number
  } {
    const byType: Record<string, { total: number; count: number }> = {}
    let totalAccuracy = 0
    let totalRecords = 0
    let winWithHighAccuracy = 0
    let totalWithOutcome = 0

    for (const report of this._reports) {
      for (const acc of report.adviceAccuracy) {
        if (adviceType && acc.adviceType !== adviceType) continue
        const key = acc.adviceType
        if (!byType[key]) byType[key] = { total: 0, count: 0 }
        byType[key].total += acc.accuracyScore
        byType[key].count++
        totalAccuracy += acc.accuracyScore
        totalRecords++
      }
      if (report.outcome.outcome !== 'unknown') {
        totalWithOutcome++
        if (report.outcome.outcome === 'win' && report.overallAccuracy > 0.6) {
          winWithHighAccuracy++
        }
      }
    }

    const accuracyByType: Record<string, { avg: number; count: number }> = {}
    for (const [type, data] of Object.entries(byType)) {
      accuracyByType[type] = {
        avg: data.count > 0 ? data.total / data.count : 0,
        count: data.count
      }
    }

    return {
      totalReports: this._reports.length,
      avgAccuracy: totalRecords > 0 ? totalAccuracy / totalRecords : 0,
      accuracyByType,
      winCorrelation: totalWithOutcome > 0 ? winWithHighAccuracy / totalWithOutcome : 0
    }
  }

  getPredictionErrorHistory(): {
    avgPredictionError: number
    errors: Array<{ gameId: number; predicted: number; actual: number; error: number }>
  } {
    const errors = this._reports.map(r => ({
      gameId: r.gameId,
      predicted: r.performanceDelta.predictedDelta,
      actual: r.performanceDelta.actualDelta,
      error: r.performanceDelta.predictionError
    }))
    const avg = errors.length > 0
      ? errors.reduce((s, e) => s + e.error, 0) / errors.length
      : 0
    return { avgPredictionError: avg, errors }
  }

  clear(): void {
    this._reports = []
    this._onReportListeners.clear()
  }

  dispose(): void {
    this.clear()
  }
}

export function createReplayAnalysisPipeline(): ReplayAnalysisPipeline {
  return new ReplayAnalysisPipeline()
}
