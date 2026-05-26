import type { PantheonAdvice, PantheonAdviceType, PantheonAdvicePriority } from '../engine'
import type { GamePhase } from '../scheduler'
import type {
  FeatureVector,
  TrainingSample,
  CaptureEvent,
  CaptureSessionMeta
} from '../capture/experiment-capture'
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
  adviceType: PantheonAdviceType
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
  advice: PantheonAdvice,
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
    case 'enemy_weakness' as PantheonAdviceType:
      if (outcome === 'win') {
        wasAccurate = true
        accuracyScore = 0.7
        reasoning.push('game_won_enemy_exploited')
      } else {
        accuracyScore = 0.3
        reasoning.push('game_lost_enemy_not_weak_enough')
      }
      break

    case 'macro_strategy' as PantheonAdviceType:
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

    case 'mental' as PantheonAdviceType:
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

    case 'lane_matchup' as PantheonAdviceType:
      wasAccurate = selfStats.kda >= 2.0
      accuracyScore = Math.min(1.0, selfStats.kda / 5.0)
      reasoning.push(`self_kda=${selfStats.kda.toFixed(2)}`)
      break

    case 'composition' as PantheonAdviceType: {
      const teamDmg = computeTeamAvg(selfTeam, 'damageDealtToChampions')
      const enemyDmg = computeTeamAvg(enemyTeam, 'damageDealtToChampions')
      wasAccurate = teamDmg > enemyDmg
      accuracyScore = teamDmg > 0 ? Math.min(1.0, teamDmg / (teamDmg + enemyDmg)) : 0.5
      reasoning.push(`team_dmg_ratio=${accuracyScore.toFixed(2)}`)
      break
    }

    case 'risk_warning' as PantheonAdviceType:
      wasAccurate = outcome === 'loss'
      accuracyScore = outcome === 'loss' ? 0.7 : 0.5
      reasoning.push(outcome === 'loss' ? 'risk_materialized' : 'risk_managed')
      break

    case 'laning_phase' as PantheonAdviceType:
      if (selfStats.goldEarned > computeTeamAvg(enemyTeam, 'goldEarned')) {
        wasAccurate = true
        accuracyScore = 0.7
        reasoning.push('laning_gold_advantage')
      } else {
        accuracyScore = 0.4
        reasoning.push('laning_gold_deficit')
      }
      break

    case 'vision' as PantheonAdviceType:
      wasAccurate = outcome === 'win'
      accuracyScore = outcome === 'win' ? 0.6 : 0.4
      reasoning.push('vision_advice_outcome_correlated')
      break

    case 'itemization_hint' as PantheonAdviceType:
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
    advicesGiven: PantheonAdvice[]
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

  getAccuracyHistory(adviceType?: PantheonAdviceType): {
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

  getHintAdvices(): PantheonAdvice[] {
    if (this._reports.length < 2) return []

    const typeAccumulator = new Map<string, { totalAccuracy: number; count: number; lastWasAccurate: boolean }>()
    for (const report of this._reports) {
      for (const acc of report.adviceAccuracy) {
        const entry = typeAccumulator.get(acc.adviceType) || { totalAccuracy: 0, count: 0, lastWasAccurate: false }
        entry.totalAccuracy += acc.accuracyScore
        entry.count++
        entry.lastWasAccurate = acc.wasAccurate
        typeAccumulator.set(acc.adviceType, entry)
      }
    }

    const hints: PantheonAdvice[] = []
    const latestReport = this._reports[this._reports.length - 1]
    const latestOutcome = latestReport.outcome.outcome

    for (const [adviceType, stats] of typeAccumulator) {
      if (stats.count < 2) continue
      const avgAccuracy = stats.totalAccuracy / stats.count

      if (avgAccuracy > 0.7 && stats.lastWasAccurate) {
        hints.push({
          type: adviceType as PantheonAdviceType,
          priority: 2 as PantheonAdvicePriority,
          title: `${this._adviceTypeLabel(adviceType)}历史验证可靠`,
          message: `近${stats.count}场该类建议准确率${(avgAccuracy * 100).toFixed(0)}%，可继续参考`,
          evidence: [`replay_accuracy=${avgAccuracy.toFixed(3)}`, `sample_count=${stats.count}`],
          confidence: Math.min(0.9, avgAccuracy),
          audience: 'self'
        })
      }

      if (avgAccuracy < 0.35 && stats.count >= 3) {
        hints.push({
          type: adviceType as PantheonAdviceType,
          priority: 3 as PantheonAdvicePriority,
          title: `${this._adviceTypeLabel(adviceType)}建议需谨慎`,
          message: `近${stats.count}场该类建议准确率偏低(${(avgAccuracy * 100).toFixed(0)}%)，仅供参考`,
          evidence: [`replay_accuracy=${avgAccuracy.toFixed(3)}`, `low_confidence`],
          confidence: 0.4,
          audience: 'self'
        })
      }
    }

    if (latestOutcome === 'loss' && latestReport.performanceDelta.predictionError > 0.3) {
      hints.push({
        type: 'macro_strategy' as PantheonAdviceType,
        priority: 1 as PantheonAdvicePriority,
        title: '上局预测偏差较大',
        message: `上一场预测误差${(latestReport.performanceDelta.predictionError * 100).toFixed(0)}%，本局建议更保守的策略`,
        evidence: [
          `prediction_error=${latestReport.performanceDelta.predictionError.toFixed(3)}`,
          `last_outcome=${latestOutcome}`
        ],
        confidence: 0.65,
        audience: 'team'
      })
    }

    return hints
  }

  private _adviceTypeLabel(adviceType: string): string {
    const labels: Record<string, string> = {
      mental: '心态',
      macro_strategy: '宏观策略',
      rank_disparity: '段位差距',
      lane_matchup: '对线匹配',
      enemy_weakness: '对手弱点',
      composition: '阵容',
      laning_phase: '对线',
      vision: '视野',
      risk_warning: '风险预警',
      team_synergy: '团队配合',
      itemization_hint: '出装',
      objective_timing: '目标时机',
      playstyle_adaptation: '打法适应',
      gold_efficiency: '经济效率',
      true_damage_warning: '真伤预警',
      win_condition: '胜利条件',
      kda_trend: 'KDA趋势'
    }
    return labels[adviceType] || adviceType
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
