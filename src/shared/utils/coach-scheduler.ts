import type { CoachAdvice, CoachAdvicePriority, CoachAdviceType } from './coach-engine'

export type GamePhase =
  | 'pre-game'
  | 'champ-select'
  | 'loading'
  | 'early-game'
  | 'mid-game'
  | 'late-game'
  | 'post-game'
  | 'unknown'

export interface ScheduledAdvice {
  advice: CoachAdvice
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
}

const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  adviceTtlMs: 180_000,
  decayHalfLifeMs: 60_000,
  maxQueueSize: 20,
  deduplicationWindowMs: 30_000,
  phaseTransitionCooldownMs: 5_000,
  minRelevanceThreshold: 0.12,
  maxRetries: 2,
  batchCooldownMs: 3_000,
  urgentPhaseBoost: 1.3
}

const PHASE_RELEVANCE_MATRIX: Record<string, Record<GamePhase, number>> = {
  laning_phase: {
    'pre-game': 0.7,
    'champ-select': 0.6,
    'loading': 0.8,
    'early-game': 1.0,
    'mid-game': 0.4,
    'late-game': 0.1,
    'post-game': 0.0,
    'unknown': 0.5
  },
  itemization: {
    'pre-game': 0.3,
    'champ-select': 0.5,
    'loading': 0.7,
    'early-game': 0.9,
    'mid-game': 1.0,
    'late-game': 0.8,
    'post-game': 0.0,
    'unknown': 0.5
  },
  teamfight: {
    'pre-game': 0.1,
    'champ-select': 0.2,
    'loading': 0.3,
    'early-game': 0.4,
    'mid-game': 0.9,
    'late-game': 1.0,
    'post-game': 0.0,
    'unknown': 0.5
  },
  objective: {
    'pre-game': 0.1,
    'champ-select': 0.1,
    'loading': 0.3,
    'early-game': 0.6,
    'mid-game': 1.0,
    'late-game': 0.9,
    'post-game': 0.0,
    'unknown': 0.5
  },
  vision: {
    'pre-game': 0.2,
    'champ-select': 0.3,
    'loading': 0.5,
    'early-game': 0.8,
    'mid-game': 1.0,
    'late-game': 0.9,
    'post-game': 0.0,
    'unknown': 0.5
  },
  enemy_weakness: {
    'pre-game': 0.5,
    'champ-select': 0.8,
    'loading': 1.0,
    'early-game': 0.9,
    'mid-game': 0.7,
    'late-game': 0.5,
    'post-game': 0.0,
    'unknown': 0.5
  },
  team_synergy: {
    'pre-game': 0.6,
    'champ-select': 0.9,
    'loading': 1.0,
    'early-game': 0.8,
    'mid-game': 0.6,
    'late-game': 0.4,
    'post-game': 0.0,
    'unknown': 0.5
  },
  risk_warning: {
    'pre-game': 0.4,
    'champ-select': 0.7,
    'loading': 0.9,
    'early-game': 1.0,
    'mid-game': 1.0,
    'late-game': 1.0,
    'post-game': 0.0,
    'unknown': 0.5
  },
  macro_strategy: {
    'pre-game': 0.3,
    'champ-select': 0.5,
    'loading': 0.8,
    'early-game': 0.7,
    'mid-game': 1.0,
    'late-game': 0.9,
    'post-game': 0.0,
    'unknown': 0.5
  },
  mental: {
    'pre-game': 0.6,
    'champ-select': 0.8,
    'loading': 1.0,
    'early-game': 0.9,
    'mid-game': 0.8,
    'late-game': 0.7,
    'post-game': 0.0,
    'unknown': 0.5
  },
  lane_matchup: {
    'pre-game': 0.5,
    'champ-select': 0.8,
    'loading': 1.0,
    'early-game': 0.9,
    'mid-game': 0.5,
    'late-game': 0.2,
    'post-game': 0.0,
    'unknown': 0.5
  },
  rank_disparity: {
    'pre-game': 0.4,
    'champ-select': 0.7,
    'loading': 1.0,
    'early-game': 0.8,
    'mid-game': 0.5,
    'late-game': 0.3,
    'post-game': 0.0,
    'unknown': 0.5
  },
  composition: {
    'pre-game': 0.3,
    'champ-select': 1.0,
    'loading': 0.9,
    'early-game': 0.7,
    'mid-game': 0.8,
    'late-game': 0.6,
    'post-game': 0.0,
    'unknown': 0.5
  },
  itemization_hint: {
    'pre-game': 0.2,
    'champ-select': 0.5,
    'loading': 0.7,
    'early-game': 0.8,
    'mid-game': 1.0,
    'late-game': 0.9,
    'post-game': 0.0,
    'unknown': 0.5
  },
  objective_timing: {
    'pre-game': 0.1,
    'champ-select': 0.2,
    'loading': 0.4,
    'early-game': 0.7,
    'mid-game': 1.0,
    'late-game': 0.9,
    'post-game': 0.0,
    'unknown': 0.5
  },
  playstyle_adaptation: {
    'pre-game': 0.3,
    'champ-select': 0.6,
    'loading': 0.8,
    'early-game': 0.9,
    'mid-game': 1.0,
    'late-game': 0.8,
    'post-game': 0.0,
    'unknown': 0.5
  },
  gold_efficiency: {
    'pre-game': 0.1,
    'champ-select': 0.3,
    'loading': 0.5,
    'early-game': 0.7,
    'mid-game': 1.0,
    'late-game': 0.9,
    'post-game': 0.0,
    'unknown': 0.5
  },
  true_damage_warning: {
    'pre-game': 0.2,
    'champ-select': 0.6,
    'loading': 0.8,
    'early-game': 0.7,
    'mid-game': 0.9,
    'late-game': 1.0,
    'post-game': 0.0,
    'unknown': 0.5
  },
  cherry_strategy: {
    'pre-game': 0.3,
    'champ-select': 0.9,
    'loading': 1.0,
    'early-game': 0.9,
    'mid-game': 1.0,
    'late-game': 0.8,
    'post-game': 0.0,
    'unknown': 0.5
  },
  win_condition: {
    'pre-game': 0.4,
    'champ-select': 0.7,
    'loading': 1.0,
    'early-game': 0.9,
    'mid-game': 0.8,
    'late-game': 0.6,
    'post-game': 0.0,
    'unknown': 0.5
  },
  kda_trend: {
    'pre-game': 0.3,
    'champ-select': 0.5,
    'loading': 0.8,
    'early-game': 0.9,
    'mid-game': 0.7,
    'late-game': 0.5,
    'post-game': 0.0,
    'unknown': 0.5
  }
}

function computeTemporalDecay(elapsed: number, halfLife: number): number {
  return Math.pow(0.5, elapsed / halfLife)
}

function getPhaseRelevance(adviceType: string, phase: GamePhase): number {
  const matrix = PHASE_RELEVANCE_MATRIX[adviceType]
  if (!matrix) return 0.5
  return matrix[phase] ?? 0.5
}

export class CoachScheduler {
  private _queue: ScheduledAdvice[] = []
  private _currentPhase: GamePhase = 'unknown'
  private _phaseHistory: PhaseTransition[] = []
  private _config: SchedulerConfig
  private _deliveryLog: Map<string, number> = new Map()
  private _suppressedTypes: Set<string> = new Set()

  constructor(config: Partial<SchedulerConfig> = {}) {
    this._config = { ...DEFAULT_SCHEDULER_CONFIG, ...config }
  }

  get currentPhase(): GamePhase {
    return this._currentPhase
  }

  get queueLength(): number {
    return this._queue.length
  }

  get phaseHistory(): ReadonlyArray<PhaseTransition> {
    return this._phaseHistory
  }

  transitionPhase(newPhase: GamePhase): PhaseTransition | null {
    if (newPhase === this._currentPhase) return null

    const lastTransition = this._phaseHistory[this._phaseHistory.length - 1]
    if (lastTransition) {
      const elapsed = Date.now() - lastTransition.timestamp
      if (elapsed < this._config.phaseTransitionCooldownMs) return null
    }

    const transition: PhaseTransition = {
      from: this._currentPhase,
      to: newPhase,
      timestamp: Date.now(),
      queueSnapshot: this._queue.filter((e) => e.deliveredAt === null && !e.suppressed).length
    }
    this._phaseHistory.push(transition)
    this._currentPhase = newPhase
    this._recalculateRelevance()
    return transition
  }

  enqueue(advices: CoachAdvice[]): ScheduledAdvice[] {
    const now = Date.now()
    const scheduled: ScheduledAdvice[] = []

    for (const advice of advices) {
      const dedupeKey = `${advice.type}:${advice.title}`
      const lastDelivery = this._deliveryLog.get(dedupeKey)
      if (lastDelivery && (now - lastDelivery) < this._config.deduplicationWindowMs) {
        continue
      }

      if (this._suppressedTypes.has(advice.type)) {
        continue
      }

      const phaseRelevance = getPhaseRelevance(advice.type, this._currentPhase)
      const priorityBoost = (4 - advice.priority) / 4.0
      const relevanceScore = advice.confidence * phaseRelevance * (0.6 + 0.4 * priorityBoost)

      if (relevanceScore < this._config.minRelevanceThreshold) continue

      const pendingIdx = this._queue.findIndex(
        (e) => e.deliveredAt === null && `${e.advice.type}:${e.advice.title}` === dedupeKey
      )
      if (pendingIdx >= 0) {
        if (relevanceScore > this._queue[pendingIdx].relevanceScore) {
          this._queue[pendingIdx].advice = advice
          this._queue[pendingIdx].relevanceScore = relevanceScore
          this._queue[pendingIdx].scheduledAt = now
          this._queue[pendingIdx].expiresAt = now + this._config.adviceTtlMs
          this._queue[pendingIdx].phase = this._currentPhase
        }
        continue
      }

      const entry: ScheduledAdvice = {
        advice,
        scheduledAt: now,
        deliveredAt: null,
        expiresAt: now + this._config.adviceTtlMs,
        phase: this._currentPhase,
        relevanceScore,
        suppressed: false,
        retryCount: 0,
        batchId: `b-${now}`
      }

      this._queue.push(entry)
      scheduled.push(entry)
    }

    this._enforceQueueLimit()
    return scheduled
  }

  dequeue(count: number): ScheduledAdvice[] {
    const now = Date.now()
    this._pruneExpired(now)

    const eligible = this._queue
      .filter((e) => !e.suppressed && e.deliveredAt === null)
      .sort((a, b) => {
        const aDecay = computeTemporalDecay(
          now - a.scheduledAt,
          this._config.decayHalfLifeMs
        )
        const bDecay = computeTemporalDecay(
          now - b.scheduledAt,
          this._config.decayHalfLifeMs
        )
        const aScore = a.relevanceScore * aDecay
        const bScore = b.relevanceScore * bDecay
        return bScore - aScore
      })

    const result = eligible.slice(0, count)
    for (const entry of result) {
      entry.deliveredAt = now
      const dedupeKey = `${entry.advice.type}:${entry.advice.title}`
      this._deliveryLog.set(dedupeKey, now)
    }
    return result
  }

  peek(count: number): ScheduledAdvice[] {
    const now = Date.now()
    return this._queue
      .filter((e) => !e.suppressed && e.deliveredAt === null && e.expiresAt > now)
      .sort((a, b) => {
        const aDecay = computeTemporalDecay(now - a.scheduledAt, this._config.decayHalfLifeMs)
        const bDecay = computeTemporalDecay(now - b.scheduledAt, this._config.decayHalfLifeMs)
        return (b.relevanceScore * bDecay) - (a.relevanceScore * aDecay)
      })
      .slice(0, count)
  }

  suppressType(type: string): void {
    this._suppressedTypes.add(type)
    for (const entry of this._queue) {
      if (entry.advice.type === type) {
        entry.suppressed = true
      }
    }
  }

  unsuppressType(type: string): void {
    this._suppressedTypes.delete(type)
    for (const entry of this._queue) {
      if (entry.advice.type === type) {
        entry.suppressed = false
      }
    }
  }

  getSuppressedTypes(): string[] {
    return [...this._suppressedTypes]
  }

  requeue(entry: ScheduledAdvice): boolean {
    if (entry.retryCount >= this._config.maxRetries) return false
    entry.retryCount++
    entry.deliveredAt = null
    entry.scheduledAt = Date.now()
    entry.expiresAt = Date.now() + this._config.adviceTtlMs
    const phaseRelevance = getPhaseRelevance(entry.advice.type, this._currentPhase)
    const priorityBoost = (4 - entry.advice.priority) / 4.0
    entry.relevanceScore = entry.advice.confidence * phaseRelevance * (0.6 + 0.4 * priorityBoost) * 0.8
    return true
  }

  getQueueByType(): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const entry of this._queue) {
      if (entry.deliveredAt === null && !entry.suppressed) {
        counts[entry.advice.type] = (counts[entry.advice.type] || 0) + 1
      }
    }
    return counts
  }

  getStats(): {
    totalQueued: number
    delivered: number
    expired: number
    suppressed: number
    avgRelevance: number
  } {
    const now = Date.now()
    let delivered = 0
    let expired = 0
    let suppressed = 0
    let totalRelevance = 0

    for (const entry of this._queue) {
      if (entry.deliveredAt !== null) delivered++
      if (entry.expiresAt <= now) expired++
      if (entry.suppressed) suppressed++
      totalRelevance += entry.relevanceScore
    }

    return {
      totalQueued: this._queue.length,
      delivered,
      expired,
      suppressed,
      avgRelevance: this._queue.length > 0 ? totalRelevance / this._queue.length : 0
    }
  }

  clear(): void {
    this._queue = []
    this._phaseHistory = []
    this._deliveryLog.clear()
    this._suppressedTypes.clear()
    this._currentPhase = 'unknown'
  }

  private _recalculateRelevance(): void {
    for (const entry of this._queue) {
      if (entry.deliveredAt !== null) continue
      const phaseRelevance = getPhaseRelevance(entry.advice.type, this._currentPhase)
      const priorityBoost = (4 - entry.advice.priority) / 4.0
      entry.relevanceScore = entry.advice.confidence * phaseRelevance * (0.6 + 0.4 * priorityBoost)
    }
  }

  private _pruneExpired(now: number): void {
    this._queue = this._queue.filter((e) => e.expiresAt > now)

    for (const [key, timestamp] of this._deliveryLog) {
      if (now - timestamp > this._config.deduplicationWindowMs * 3) {
        this._deliveryLog.delete(key)
      }
    }
  }

  private _enforceQueueLimit(): void {
    if (this._queue.length <= this._config.maxQueueSize) return
    this._queue.sort((a, b) => b.relevanceScore - a.relevanceScore)
    this._queue = this._queue.slice(0, this._config.maxQueueSize)
  }
}

export function mapQueryPhaseToGamePhase(
  queryPhase: string,
  gameTimeSeconds?: number
): GamePhase {
  switch (queryPhase) {
    case 'unavailable':
      return 'pre-game'
    case 'champ-select':
      return 'champ-select'
    case 'loading':
      return 'loading'
    case 'in-game':
      if (gameTimeSeconds === undefined) return 'early-game'
      if (gameTimeSeconds < 840) return 'early-game'
      if (gameTimeSeconds < 1500) return 'mid-game'
      return 'late-game'
    case 'end-of-game':
      return 'post-game'
    default:
      return 'unknown'
  }
}

export function getPhaseDisplayName(phase: GamePhase): string {
  const names: Record<GamePhase, string> = {
    'pre-game': '赛前',
    'champ-select': '选人',
    'loading': '加载中',
    'early-game': '前期',
    'mid-game': '中期',
    'late-game': '后期',
    'post-game': '赛后',
    'unknown': '未知'
  }
  return names[phase] || '未知'
}

export function createCoachScheduler(config?: Partial<SchedulerConfig>): CoachScheduler {
  return new CoachScheduler(config)
}
