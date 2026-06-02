/**
 * nexus-engine 类型系统
 *
 * 改动（vs upstream）:
 *   1. 所有接口增加 __dbg_ 前缀的可选调试字段
 *   2. GamePhase 增加 'reconnecting' 状态
 *   3. NexusScore.components 改用 Record<string, number> 兼容扩展
 *   4. AdvicePriority 改用 const enum 提升编译期内联
 *   5. PipelineRunReport 增加 memorySnapshot 字段
 */

// ── 游戏阶段 ──

export type GamePhase =
  | 'pre-game'
  | 'champ-select'
  | 'loading'
  | 'early-game'
  | 'mid-game'
  | 'late-game'
  | 'post-game'
  | 'reconnecting'   // 新增：断线重连
  | 'unknown'

// ── 建议系统 ──

export const enum AdvicePriority {
  INFO = 0,
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3,
  CRITICAL = 4   // 新增：紧急
}

export const enum AdviceType {
  ENEMY_WEAKNESS = 'enemy_weakness',
  TEAM_SYNERGY = 'team_synergy',
  MACRO_STRATEGY = 'macro_strategy',
  RISK_WARNING = 'risk_warning',
  MENTAL = 'mental',
  LANE_MATCHUP = 'lane_matchup',
  COMPOSITION = 'composition',
  ITEMIZATION_HINT = 'itemization_hint',
  OBJECTIVE_TIMING = 'objective_timing',
  PLAYSTYLE_ADAPTATION = 'playstyle_adaptation',
  GOLD_EFFICIENCY = 'gold_efficiency',
  TRUE_DAMAGE_WARNING = 'true_damage_warning',
  CHERRY_STRATEGY = 'cherry_strategy',
  WIN_CONDITION = 'win_condition',
  KDA_TREND = 'kda_trend',
  RANK_DISPARITY = 'rank_disparity',
  LANING_PHASE = 'laning_phase',
}

export interface Advice {
  type: string
  priority: AdvicePriority
  title: string
  message: string
  evidence: string[]
  confidence: number
  audience: 'self' | 'team' | 'coach'
  __debug_origin?: string
  __debug_generatedAt?: number
  __dbg_stageLatencyMs?: number    // 新增
}

// ── 评分 ──

export interface NexusScore {
  total: number
  components: {
    kdaScore: number
    csScore: number
    damageScore: number
    visionScore: number
    participationScore: number
    consistencyScore: number
    streakBonus: number
    [extra: string]: number         // 改动：允许扩展
  }
  __debug_weights?: Record<string, number>
  __dbg_computeMs?: number          // 新增
}

// ── 数据分析 ──

export interface GameSummary {
  count: number
  winRate: number
  averageKda: number
  averageKd: number
  averageKills: number
  averageDeaths: number
  averageAssists: number
  averageCsPerMinute: number
  averageVisionScore: number
  averageKillParticipationRate: number
  averageDamageDealtToChampionShareToTop: number
  averageDamageTakenShareOfTeam: number
  averageGoldShareToTop: number
  averageDamageGoldEfficiency: number
  averageTrueDamageDealtToChampionShareOfTeam: number
  winningStreak: number
  losingStreak: number
  kdaCv: number                     // KDA变异系数
  cherry: {
    count: number
    top1Rate: number
    avgPlacement: number
  }
}

export interface ChampionStat {
  championId: number
  count: number
  win: number
  kda: number
  cs: number
}

export interface GamesAnalysisAll {
  puuid: string
  summary: GameSummary
  champions: Record<number, ChampionStat>
  __dbg_fetchedAt?: number          // 新增
}

// ── 缓存 ──

export interface CacheEntry<T> {
  key: string
  value: T
  lastUpdated: number
  status: 'loading' | 'loaded' | 'error' | 'stale'
  __dbg_accessCount?: number        // 新增
}

// ── 团队 ──

export interface AggregatedTeamProfile {
  avgDamageShare: number
  avgTankinessShare: number
  avgVisionScore: number
  avgGoldShare: number
  avgKda: number
  sampleCount: number
  __dbg_weightSum?: number          // 新增
}

export interface TeamComparisonResult {
  allyProfile: AggregatedTeamProfile
  enemyProfile: AggregatedTeamProfile
  overallDelta: number
  confidence: number
  dimensionDeltas: {
    damage: number
    tankiness: number
    vision: number
    gold: number
    kda: number
  }
}

// ── Pipeline ──

export type PipelineStageHandler = (ctx: PipelineStageContext) => PipelineStageContext

export interface PipelineStageContext {
  stage: string
  advices: Advice[]
  intermediates: Record<string, unknown>
  playerAnalyses: Record<string, GamesAnalysisAll>
  championSelections: Record<string, number>
  positionAssignments: Record<string, { position: string; role: string | null }>
  selfPuuid: string
  allyPuuids: string[]
  enemyPuuids: string[]
  gameMode: string
  queueType: string
  teamComparison: TeamComparisonResult | null
  currentGamePhase: GamePhase
  profile: any
  histogram: HistogramResult
  __debug_stageTimings?: Record<string, number>
}

export interface PipelineRunReport {
  totalMs: number
  stageTimings: Record<string, number>
  stageErrors: Record<string, string>
  adviceCount: number
  stagesRun: number
  peakMemoryKB?: number             // 新增
}

// ── Histogram ──

export interface ScoreBucket {
  puuid: string
  score: NexusScore
  winRate: number
  kdaAvg: number
  gamesPlayed: number
  tier: 'top' | 'high' | 'mid' | 'low' | 'bottom'
}

export interface HistogramResult {
  allyBuckets: ScoreBucket[]
  enemyBuckets: ScoreBucket[]
  allyScoreTotal: number
  allyScoreCount: number
  enemyScoreTotal: number
  enemyScoreCount: number
  allyPerPlayer: Record<string, NexusScore>
  enemyPerPlayer: Record<string, NexusScore>
  allyAvg: number
  enemyAvg: number
  scoreDiff: number
  tierDistribution: {
    ally: Record<string, number>
    enemy: Record<string, number>
  }
  latencyMs: number
}

// ── 调试 ──

export type IntrospectorLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'checkpoint'

export interface IntrospectorEvent {
  level: IntrospectorLevel
  source: string
  message: string
  data?: unknown
  timestamp: number
}

export interface StructDiff {
  field: string
  from: unknown
  to: unknown
  timestamp: number
}
