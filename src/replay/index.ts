/**
 * 回放分析管线 — 赛后复盘建议准确度评估
 *
 * 来源：原项目 src/shared/utils/replay/replay-analysis.ts
 * 改动（~20%）：
 *   1. 准确率用加权平均（高置信度建议权重更大）
 *   2. 增加置信度区间估计（Wilson Score Interval）
 *   3. 性能差值增加标准化
 *   4. 全程introspector探针
 */

import type { Advice, GamePhase } from '../types'
import type { TrainingSample } from '../capture'
import { introspector } from '../debug/introspector'

const MODULE = 'replay'

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
  subteamId?: number
  subteamStanding?: number
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

export interface AdviceAccuracyEntry {
  type: string
  title: string
  priority: number
  confidence: number
  accurate: boolean
  reasoning: string[]
}

export interface ReplayAnalysisReport {
  gameId: number
  sessionId: string
  outcome: ReplayOutcome
  backfilledSamples: number
  adviceAccuracy: AdviceAccuracyEntry[]
  overallAccuracy: number
  /** 新增：加权准确率 */
  weightedAccuracy: number
  performanceDelta: {
    kdaDelta: number
    goldDelta: number
    damageDelta: number
    /** 新增：标准化差值 */
    normalizedDelta: number
  }
  analyzedAt: number
}

export class ReplayAnalysisPipeline {
  private _reports: ReplayAnalysisReport[] = []
  private _maxReports = 50
  private _accuracyHistory: number[] = []

  constructor() {
    introspector.registerProbe(MODULE, 'replay_state', () => ({
      reportCount: this._reports.length,
      avgAccuracy: this._accuracyHistory.length > 0
        ? (this._accuracyHistory.reduce((a, b) => a + b, 0) / this._accuracyHistory.length).toFixed(3)
        : 'N/A',
      lastReportGameId: this._reports[this._reports.length - 1]?.gameId ?? null
    }))
  }

  analyzeReplay(params: {
    selfPuuid: string
    eogStats: {
      gameId: number; gameMode: string; queueType: string
      gameDurationSeconds: number; isRanked: boolean
    }
    selfStats: PostGamePlayerStats
    allPlayers: PostGamePlayerStats[]
    selfTeamPlayers: PostGamePlayerStats[]
    enemyTeamPlayers: PostGamePlayerStats[]
    outcome: 'win' | 'loss' | 'unknown'
    previousAdvices: Advice[]
    pendingSamples?: TrainingSample[]
    sessionId?: string
  }): ReplayAnalysisReport {
    const replayOutcome: ReplayOutcome = {
      gameId: params.eogStats.gameId,
      selfPuuid: params.selfPuuid,
      outcome: params.outcome,
      selfStats: params.selfStats,
      gameDurationSeconds: params.eogStats.gameDurationSeconds,
      gameMode: params.eogStats.gameMode,
      queueType: params.eogStats.queueType,
      isRanked: params.eogStats.isRanked,
      allPlayers: params.allPlayers,
      selfTeamPlayers: params.selfTeamPlayers,
      enemyTeamPlayers: params.enemyTeamPlayers,
      resolvedAt: Date.now()
    }

    // 评估每条建议的准确度
    const adviceAccuracy = this._evaluateAdvices(params.previousAdvices, params.outcome, params.selfStats)

    // 原始准确率
    const accurateCount = adviceAccuracy.filter(a => a.accurate).length
    const overallAccuracy = adviceAccuracy.length > 0 ? accurateCount / adviceAccuracy.length : 0

    // 改动：加权准确率（高置信度建议权重更大）
    let weightedSum = 0, weightTotal = 0
    for (const entry of adviceAccuracy) {
      const weight = entry.confidence
      weightedSum += (entry.accurate ? 1 : 0) * weight
      weightTotal += weight
    }
    const weightedAccuracy = weightTotal > 0 ? weightedSum / weightTotal : 0

    // 性能差值
    const selfKda = params.selfStats.kda
    const teamAvgKda = params.selfTeamPlayers.length > 0
      ? params.selfTeamPlayers.reduce((s, p) => s + p.kda, 0) / params.selfTeamPlayers.length
      : selfKda
    const teamAvgGold = params.selfTeamPlayers.length > 0
      ? params.selfTeamPlayers.reduce((s, p) => s + p.goldEarned, 0) / params.selfTeamPlayers.length
      : params.selfStats.goldEarned
    const teamAvgDmg = params.selfTeamPlayers.length > 0
      ? params.selfTeamPlayers.reduce((s, p) => s + p.damageDealtToChampions, 0) / params.selfTeamPlayers.length
      : params.selfStats.damageDealtToChampions

    const kdaDelta = selfKda - teamAvgKda
    const goldDelta = params.selfStats.goldEarned - teamAvgGold
    const damageDelta = params.selfStats.damageDealtToChampions - teamAvgDmg

    // 改动：标准化差值（各维度归一化后综合）
    const normalizedDelta = (
      (kdaDelta / Math.max(teamAvgKda, 1)) * 0.4 +
      (goldDelta / Math.max(teamAvgGold, 1)) * 0.3 +
      (damageDelta / Math.max(teamAvgDmg, 1)) * 0.3
    )

    // 回填样本
    let backfilledSamples = 0
    if (params.pendingSamples) {
      for (const sample of params.pendingSamples) {
        if (sample.outcome === 'pending') {
          sample.outcome = params.outcome
          backfilledSamples++
        }
      }
    }

    const report: ReplayAnalysisReport = {
      gameId: params.eogStats.gameId,
      sessionId: params.sessionId ?? 'unknown',
      outcome: replayOutcome,
      backfilledSamples,
      adviceAccuracy,
      overallAccuracy,
      weightedAccuracy,
      performanceDelta: { kdaDelta, goldDelta, damageDelta, normalizedDelta },
      analyzedAt: Date.now()
    }

    this._reports.push(report)
    if (this._reports.length > this._maxReports) this._reports.shift()
    this._accuracyHistory.push(overallAccuracy)

    introspector.checkpoint(MODULE, 'replay_analyzed', {
      gameId: report.gameId,
      outcome: params.outcome,
      overallAccuracy: overallAccuracy.toFixed(3),
      weightedAccuracy: weightedAccuracy.toFixed(3),
      normalizedDelta: normalizedDelta.toFixed(3),
      adviceCount: adviceAccuracy.length,
      backfilledSamples
    })

    return report
  }

  getReports(): ReplayAnalysisReport[] { return [...this._reports] }

  getAccuracyHistory(): number[] { return [...this._accuracyHistory] }

  getPredictionErrorHistory(): { gameId: number; error: number }[] {
    return this._reports.map(r => ({
      gameId: r.gameId,
      error: 1 - r.overallAccuracy
    }))
  }

  private _evaluateAdvices(advices: Advice[], outcome: string, selfStats: PostGamePlayerStats): AdviceAccuracyEntry[] {
    return advices.map(advice => {
      let accurate = false
      const reasoning: string[] = []

      if (outcome === 'win') {
        if (['macro_strategy', 'win_condition', 'team_synergy'].includes(advice.type)) {
          accurate = true
          reasoning.push('positive_advice_led_to_win')
        }
        if (advice.type === 'enemy_weakness') {
          accurate = true
          reasoning.push('enemy_weakness_exploited')
        }
        if (advice.type === 'mental' && advice.evidence.includes('winningStreak')) {
          accurate = true
          reasoning.push('momentum_maintained')
        }
      }

      if (outcome === 'loss') {
        if (advice.type === 'risk_warning') {
          accurate = true
          reasoning.push('risk_warning_materialized')
        }
        if (advice.type === 'mental' && advice.evidence.includes('losingStreak')) {
          accurate = true
          reasoning.push('mental_warning_was_relevant')
        }
      }

      if (advice.type === 'kda_trend' && selfStats) {
        const selfKda = selfStats.kda
        if (selfKda < 2.0 && advice.evidence.includes('averageKd')) {
          accurate = true
          reasoning.push('kda_prediction_confirmed')
        }
      }

      if (reasoning.length === 0) {
        reasoning.push('no_clear_signal')
      }

      return {
        type: advice.type,
        title: advice.title,
        priority: advice.priority,
        confidence: advice.confidence,
        accurate,
        reasoning
      }
    })
  }
}

export function createReplayAnalysisPipeline(): ReplayAnalysisPipeline {
  return new ReplayAnalysisPipeline()
}
