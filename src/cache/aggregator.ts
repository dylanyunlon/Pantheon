/**
 * 团队聚合分析器
 *
 * 来源：原项目 src/shared/utils/cache/aggregator.ts
 * 改动（~20%）：
 *   1. RingReducer 增加滑动窗口容量限制（原项目无上限）
 *   2. compareTeams 的置信度计算引入样本量衰减函数
 *   3. aggregateTeamProfile 增加加权平均（按场次加权，原项目等权）
 *   4. 全程调试检查点
 */

import {
  GamesAnalysisAll,
  TeamComparisonResult,
  AggregatedTeamProfile
} from '../types'
import { introspector } from '../debug/introspector'

const MODULE = 'aggregator'

export class RingReducer<T> {
  private _entries = new Map<string, T[]>()
  private _reducer: (acc: T, cur: T) => T
  private _identity: T
  private _windowSize: number

  constructor(reducer: (acc: T, cur: T) => T, identity: T, windowSize: number = 50) {
    this._reducer = reducer
    this._identity = identity
    this._windowSize = windowSize
  }

  push(key: string, value: T): void {
    if (!this._entries.has(key)) {
      this._entries.set(key, [])
    }
    const arr = this._entries.get(key)!
    arr.push(value)
    // 滑动窗口：只保留最近N个值（新增）
    if (arr.length > this._windowSize) {
      arr.shift()
    }
  }

  reduce(): T {
    let result = this._identity
    for (const [, values] of this._entries) {
      for (const v of values) {
        result = this._reducer(result, v)
      }
    }
    return result
  }

  clear(): void {
    this._entries.clear()
  }

  /**
   * 调试：返回每个key的当前缓冲区大小
   */
  debugBufferSizes(): Record<string, number> {
    const sizes: Record<string, number> = {}
    for (const [key, values] of this._entries) {
      sizes[key] = values.length
    }
    return sizes
  }
}

export class BatchAggregationContext {
  private _staged = new Map<string, unknown>()
  private _committed = false

  stage(key: string, value: unknown): void {
    this._staged.set(key, value)
  }

  commit(): void {
    this._committed = true
    introspector.debug(MODULE, 'Batch committed', {
      stagedKeys: Array.from(this._staged.keys()),
      committed: this._committed
    })
  }

  isCommitted(): boolean { return this._committed }
  get(key: string): unknown { return this._staged.get(key) }
}

/**
 * 聚合团队画像
 * 改动：按场次加权平均（原项目等权，场次多的玩家权重更大）
 */
export function aggregateTeamProfile(
  puuids: string[],
  analyses: Record<string, GamesAnalysisAll>
): AggregatedTeamProfile {
  let totalDmg = 0, totalTank = 0, totalVision = 0, totalGold = 0, totalKda = 0
  let totalWeight = 0
  let sampleCount = 0

  for (const puuid of puuids) {
    const a = analyses[puuid]
    if (!a || a.summary.count === 0) continue

    // 权重 = 场次（改动：原项目等权1.0）
    const weight = Math.sqrt(a.summary.count) // sqrt避免高场次玩家过度主导
    const s = a.summary

    totalDmg += s.averageDamageDealtToChampionShareToTop * weight
    totalTank += s.averageDamageTakenShareOfTeam * weight
    totalVision += s.averageVisionScore * weight
    totalGold += s.averageGoldShareToTop * weight
    totalKda += s.averageKda * weight
    totalWeight += weight
    sampleCount++
  }

  if (totalWeight === 0) {
    return { avgDamageShare: 0, avgTankinessShare: 0, avgVisionScore: 0, avgGoldShare: 0, avgKda: 0, sampleCount: 0 }
  }

  const profile: AggregatedTeamProfile = {
    avgDamageShare: totalDmg / totalWeight,
    avgTankinessShare: totalTank / totalWeight,
    avgVisionScore: totalVision / totalWeight,
    avgGoldShare: totalGold / totalWeight,
    avgKda: totalKda / totalWeight,
    sampleCount
  }

  introspector.checkpoint(MODULE, 'team_profile_aggregated', {
    sampleCount,
    totalWeight: totalWeight.toFixed(2),
    profile
  })

  return profile
}

/**
 * 比较两队画像
 * 改动：置信度计算引入样本量衰减（原项目线性，这里用根号）
 */
export function compareTeams(
  allyPuuids: string[],
  enemyPuuids: string[],
  analyses: Record<string, GamesAnalysisAll>
): TeamComparisonResult {
  const allyProfile = aggregateTeamProfile(allyPuuids, analyses)
  const enemyProfile = aggregateTeamProfile(enemyPuuids, analyses)

  const dimensionDeltas = {
    damage: allyProfile.avgDamageShare - enemyProfile.avgDamageShare,
    tankiness: allyProfile.avgTankinessShare - enemyProfile.avgTankinessShare,
    vision: allyProfile.avgVisionScore - enemyProfile.avgVisionScore,
    gold: allyProfile.avgGoldShare - enemyProfile.avgGoldShare,
    kda: allyProfile.avgKda - enemyProfile.avgKda
  }

  // 加权总体差值
  const overallDelta =
    dimensionDeltas.damage * 0.30 +
    dimensionDeltas.kda * 0.25 +
    dimensionDeltas.gold * 0.20 +
    dimensionDeltas.tankiness * 0.15 +
    dimensionDeltas.vision * 0.10

  // 置信度（改动：使用根号衰减而非线性）
  const minSample = Math.min(allyProfile.sampleCount, enemyProfile.sampleCount)
  // sqrt(min/5) capped at 1.0 —— 需要5个样本达到完全置信
  // 原项目用 min/5 线性，这里根号让少量样本也有一定置信度
  const confidence = Math.min(1.0, Math.sqrt(minSample / 5)) * 0.85

  const result: TeamComparisonResult = {
    allyProfile,
    enemyProfile,
    overallDelta,
    confidence,
    dimensionDeltas
  }

  introspector.checkpoint(MODULE, 'team_comparison_complete', {
    overallDelta: overallDelta.toFixed(4),
    confidence: confidence.toFixed(3),
    dimensionDeltas,
    allySamples: allyProfile.sampleCount,
    enemySamples: enemyProfile.sampleCount
  })

  return result
}

/**
 * 调试辅助：打印团队对比的人类可读报告
 */
export function debugPrintTeamComparison(result: TeamComparisonResult): void {
  const d = result.dimensionDeltas
  const bar = (v: number): string => {
    const blocks = Math.round(Math.abs(v) * 20)
    const ch = v >= 0 ? '█' : '░'
    const dir = v >= 0 ? 'ALLY+' : 'ENEMY+'
    return `${dir} ${ch.repeat(Math.max(1, blocks))} (${(v * 100).toFixed(1)}%)`
  }

  console.log('\n── Team Comparison ──')
  console.log(`  DMG:  ${bar(d.damage)}`)
  console.log(`  TANK: ${bar(d.tankiness)}`)
  console.log(`  VIS:  ${bar(d.vision)}`)
  console.log(`  GOLD: ${bar(d.gold)}`)
  console.log(`  KDA:  ${bar(d.kda)}`)
  console.log(`  OVERALL: ${result.overallDelta >= 0 ? '+' : ''}${(result.overallDelta * 100).toFixed(1)}%`)
  console.log(`  CONFIDENCE: ${(result.confidence * 100).toFixed(0)}%`)
  console.log('─'.repeat(40))
}
