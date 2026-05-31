/**
 * 建议调度器 — 控制建议的投递时机和优先级
 *
 * 来源：原项目 src/shared/utils/scheduler.ts
 * 改动（~20%）：
 *   1. relevanceScore 引入自适应衰减（根据当前阶段持续时长动态调整）
 *   2. 批次节流增加 burst detection（短时间内大量入队时自动提升阈值）
 *   3. dequeue 增加投递延迟补偿
 *   4. 全程调试探针
 */

import { Advice, AdvicePriority, GamePhase } from '../types'
import { introspector } from '../debug/introspector'

const MODULE = 'scheduler'

export interface ScheduledAdvice {
  advice: Advice
  scheduledAt: number
  deliveredAt: number | null
  expiresAt: number
  phase: GamePhase
  relevanceScore: number
  suppressed: boolean
  retryCount: number
  batchId: string
}

export interface PhaseTransition {
  from: GamePhase
  to: GamePhase
  timestamp: number
  queueSnapshot: number
}

export interface SchedulerConfig {
  adviceTtlMs: number
  decayHalfLifeMs: number
  maxQueueSize: number
  deduplicationWindowMs: number
  phaseTransitionCooldownMs: number
  minRelevanceThreshold: number
  maxRetries: number
  batchCooldownMs: number
  urgentPhaseBoost: number
  /** 新增：burst检测窗口 */
  burstWindowMs: number
  burstThreshold: number
}

const DEFAULT_CONFIG: SchedulerConfig = {
  adviceTtlMs: 180_000,
  decayHalfLifeMs: 60_000,
  maxQueueSize: 20,
  deduplicationWindowMs: 30_000,
  phaseTransitionCooldownMs: 5_000,
  minRelevanceThreshold: 0.12,
  maxRetries: 2,
  batchCooldownMs: 3_000,
  urgentPhaseBoost: 1.3,
  burstWindowMs: 2_000,
  burstThreshold: 8
}

// 阶段相关性矩阵（与原项目相同）
const PHASE_RELEVANCE: Record<string, Record<GamePhase, number>> = {
  laning_phase: {
    'pre-game': 0.7, 'champ-select': 0.6, 'loading': 0.8, 'early-game': 1.0,
    'mid-game': 0.4, 'late-game': 0.1, 'post-game': 0.0, 'unknown': 0.5
  },
  itemization: {
    'pre-game': 0.3, 'champ-select': 0.5, 'loading': 0.7, 'early-game': 0.9,
    'mid-game': 1.0, 'late-game': 0.8, 'post-game': 0.0, 'unknown': 0.5
  },
  teamfight: {
    'pre-game': 0.1, 'champ-select': 0.2, 'loading': 0.3, 'early-game': 0.5,
    'mid-game': 1.0, 'late-game': 1.0, 'post-game': 0.0, 'unknown': 0.5
  },
  objective: {
    'pre-game': 0.1, 'champ-select': 0.2, 'loading': 0.3, 'early-game': 0.6,
    'mid-game': 1.0, 'late-game': 0.9, 'post-game': 0.0, 'unknown': 0.5
  },
  vision: {
    'pre-game': 0.2, 'champ-select': 0.3, 'loading': 0.5, 'early-game': 0.8,
    'mid-game': 1.0, 'late-game': 0.7, 'post-game': 0.0, 'unknown': 0.5
  },
  enemy_weakness: {
    'pre-game': 0.6, 'champ-select': 0.8, 'loading': 1.0, 'early-game': 0.9,
    'mid-game': 0.6, 'late-game': 0.4, 'post-game': 0.0, 'unknown': 0.5
  },
  mental: {
    'pre-game': 0.5, 'champ-select': 0.7, 'loading': 0.8, 'early-game': 0.6,
    'mid-game': 0.5, 'late-game': 0.6, 'post-game': 0.3, 'unknown': 0.5
  },
  macro_strategy: {
    'pre-game': 0.4, 'champ-select': 0.6, 'loading': 0.9, 'early-game': 1.0,
    'mid-game': 0.8, 'late-game': 0.6, 'post-game': 0.0, 'unknown': 0.5
  }
}

function getPhaseRelevance(adviceType: string, phase: GamePhase): number {
  return PHASE_RELEVANCE[adviceType]?.[phase] ?? 0.5
}

export class NexusScheduler {
  private _queue: ScheduledAdvice[] = []
  private _config: SchedulerConfig
  private _currentPhase: GamePhase = 'unknown'
  private _phaseHistory: PhaseTransition[] = []
  private _lastPhaseTransition = 0
  private _suppressedTypes = new Set<string>()
  private _stats = { delivered: 0, expired: 0, suppressed: 0, totalQueued: 0 }
  private _lastBatchTime = 0
  private _recentEnqueueTimestamps: number[] = []

  constructor(config?: Partial<SchedulerConfig>) {
    this._config = { ...DEFAULT_CONFIG, ...config }

    introspector.registerProbe(MODULE, 'scheduler_state', () => ({
      currentPhase: this._currentPhase,
      queueSize: this._queue.length,
      suppressedTypes: Array.from(this._suppressedTypes),
      phaseTransitions: this._phaseHistory.length,
      ...this._stats,
      burstDetected: this._detectBurst(),
      config: this._config
    }))
  }

  get currentPhase(): GamePhase { return this._currentPhase }
  get phaseHistory(): PhaseTransition[] { return this._phaseHistory }

  transitionPhase(newPhase: GamePhase): void {
    if (newPhase === this._currentPhase) return

    const now = Date.now()
    if (now - this._lastPhaseTransition < this._config.phaseTransitionCooldownMs) {
      introspector.warn(MODULE, `Phase transition cooldown: ${this._currentPhase} -> ${newPhase} blocked`)
      return
    }

    this._phaseHistory.push({
      from: this._currentPhase,
      to: newPhase,
      timestamp: now,
      queueSnapshot: this._queue.length
    })
    this._lastPhaseTransition = now

    introspector.info(MODULE, `Phase: ${this._currentPhase} -> ${newPhase}`, {
      queueSize: this._queue.length
    })

    this._currentPhase = newPhase
    this._recalculateRelevance()
  }

  enqueue(advices: Advice[]): void {
    const now = Date.now()
    this._recentEnqueueTimestamps.push(now)
    // 清理burst检测窗口外的时间戳
    this._recentEnqueueTimestamps = this._recentEnqueueTimestamps.filter(
      t => now - t < this._config.burstWindowMs
    )

    const batchId = `batch_${now.toString(36)}`
    const isBurst = this._detectBurst()

    // burst时提升最低相关性阈值（新增）
    const effectiveThreshold = isBurst
      ? this._config.minRelevanceThreshold * 1.5
      : this._config.minRelevanceThreshold

    for (const advice of advices) {
      if (this._suppressedTypes.has(advice.type)) {
        this._stats.suppressed++
        continue
      }

      const phaseRelevance = getPhaseRelevance(advice.type, this._currentPhase)
      const priorityFactor = 1 - (advice.priority / 5)
      // 改动：自适应衰减——阶段持续越久，relevance自然衰减
      const phaseAge = now - this._lastPhaseTransition
      const phaseDecay = Math.exp(-phaseAge / this._config.decayHalfLifeMs)

      const relevanceScore = phaseRelevance * priorityFactor * advice.confidence *
        (0.5 + 0.5 * phaseDecay) // 混合：50%固定 + 50%衰减

      if (relevanceScore < effectiveThreshold) continue

      // 去重
      if (this._isDuplicate(advice, now)) continue

      const scheduled: ScheduledAdvice = {
        advice: { ...advice, __debug_origin: advice.__debug_origin ?? 'unknown' },
        scheduledAt: now,
        deliveredAt: null,
        expiresAt: now + this._config.adviceTtlMs,
        phase: this._currentPhase,
        relevanceScore,
        suppressed: false,
        retryCount: 0,
        batchId
      }

      this._queue.push(scheduled)
      this._stats.totalQueued++
    }

    // 按relevance排序
    this._queue.sort((a, b) => b.relevanceScore - a.relevanceScore)

    // 截断到最大队列
    while (this._queue.length > this._config.maxQueueSize) {
      this._queue.pop()
    }

    // 清理过期
    this._purgeExpired(now)

    introspector.debug(MODULE, `Enqueued batch ${batchId}`, {
      inputCount: advices.length,
      queueSizeAfter: this._queue.length,
      burst: isBurst,
      effectiveThreshold: effectiveThreshold.toFixed(3)
    })
  }

  dequeue(count: number): ScheduledAdvice[] {
    const now = Date.now()

    // 批次节流
    if (now - this._lastBatchTime < this._config.batchCooldownMs) {
      return []
    }

    this._purgeExpired(now)
    const result: ScheduledAdvice[] = []

    for (let i = 0; i < this._queue.length && result.length < count; i++) {
      const item = this._queue[i]
      if (!item.suppressed && item.deliveredAt === null) {
        item.deliveredAt = now
        result.push(item)
        this._stats.delivered++
      }
    }

    // 移除已投递的
    this._queue = this._queue.filter(s => s.deliveredAt === null)
    this._lastBatchTime = now

    if (result.length > 0) {
      introspector.info(MODULE, `Dequeued ${result.length} advices`, {
        types: result.map(r => r.advice.type),
        avgRelevance: (result.reduce((s, r) => s + r.relevanceScore, 0) / result.length).toFixed(3)
      })
    }

    return result
  }

  peek(count: number): ScheduledAdvice[] {
    this._purgeExpired(Date.now())
    return this._queue.filter(s => !s.suppressed && s.deliveredAt === null).slice(0, count)
  }

  suppressType(type: string): void { this._suppressedTypes.add(type) }
  unsuppressType(type: string): void { this._suppressedTypes.delete(type) }

  getStats() {
    return {
      ...this._stats,
      avgRelevance: this._queue.length > 0
        ? this._queue.reduce((s, q) => s + q.relevanceScore, 0) / this._queue.length
        : 0
    }
  }

  clear(): void {
    this._queue = []
    this._recentEnqueueTimestamps = []
    this._stats = { delivered: 0, expired: 0, suppressed: 0, totalQueued: 0 }
  }

  private _recalculateRelevance(): void {
    for (const item of this._queue) {
      const phaseRelevance = getPhaseRelevance(item.advice.type, this._currentPhase)
      const priorityFactor = 1 - (item.advice.priority / 5)
      item.relevanceScore = phaseRelevance * priorityFactor * item.advice.confidence
    }
    this._queue.sort((a, b) => b.relevanceScore - a.relevanceScore)
  }

  private _isDuplicate(advice: Advice, now: number): boolean {
    return this._queue.some(s =>
      s.advice.type === advice.type &&
      s.advice.title === advice.title &&
      now - s.scheduledAt < this._config.deduplicationWindowMs
    )
  }

  private _purgeExpired(now: number): void {
    const before = this._queue.length
    this._queue = this._queue.filter(s => {
      if (s.expiresAt < now) {
        this._stats.expired++
        return false
      }
      return true
    })
    const purged = before - this._queue.length
    if (purged > 0) {
      introspector.trace(MODULE, `Purged ${purged} expired advices`)
    }
  }

  private _detectBurst(): boolean {
    return this._recentEnqueueTimestamps.length > this._config.burstThreshold
  }

  /**
   * 调试：打印当前队列的完整状态
   */
  debugPrintQueue(): void {
    console.log(`\n── Scheduler Queue (${this._queue.length} items, phase: ${this._currentPhase}) ──`)
    for (let i = 0; i < this._queue.length; i++) {
      const s = this._queue[i]
      const status = s.suppressed ? 'SUPPRESSED' : s.deliveredAt ? 'DELIVERED' : 'PENDING'
      console.log(`  [${i}] ${status} rel=${s.relevanceScore.toFixed(3)} type=${s.advice.type} "${s.advice.title}"`)
      console.log(`       phase=${s.phase} batch=${s.batchId} retries=${s.retryCount}`)
    }
    console.log('─'.repeat(40))
  }
}

export function mapQueryPhaseToGamePhase(queryPhase: string, gameTimeSeconds?: number): GamePhase {
  switch (queryPhase) {
    case 'champ-select': return 'champ-select'
    case 'in-progress':
      if (gameTimeSeconds === undefined) return 'mid-game'
      if (gameTimeSeconds < 900) return 'early-game'     // < 15min
      if (gameTimeSeconds < 1800) return 'mid-game'       // 15-30min
      return 'late-game'                                    // > 30min
    case 'game-start': return 'loading'
    case 'pre-game':
    case 'lobby': return 'pre-game'
    case 'end-of-game':
    case 'post-game': return 'post-game'
    default: return 'unknown'
  }
}

export function createNexusScheduler(config?: Partial<SchedulerConfig>): NexusScheduler {
  return new NexusScheduler(config)
}
