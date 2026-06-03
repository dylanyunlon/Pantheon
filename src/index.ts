// @ts-nocheck
/**
 * nexus-engine — 统一公共API
 *
 * 移植自 upstream/src/index.ts
 * 改动：
 *   1. 新增导出 NexusIntrospector, StructWatcher（upstream未实现）
 *   2. 新增导出所有 debugPrint* 函数
 *   3. 导出 NexusCache facade
 *   4. 重新组织导出顺序（按依赖层级从低到高）
 */

// ── Debug / Introspection（最底层）────────────────────────────────
export { NexusIntrospector, StructWatcher, introspector } from './debug/introspector'
export { dumpAllState } from './debug/dump-all'
export { runMockPipeline } from './debug/run-pipeline'

// ── Core Types ───────────────────────────────────────────────────
export type {
  GamePhase, NexusScore, GamesAnalysisAll, GameSummary, ChampionStat,
  CacheEntry, AggregatedTeamProfile, TeamComparisonResult,
  PipelineStageHandler, PipelineStageContext, PipelineRunReport,
  HistogramResult, ScoreBucket,
  Advice, IntrospectorEvent, StructDiff
} from './types'
export { AdvicePriority, AdviceType } from './types'

// ── Core Scoring ─────────────────────────────────────────────────
export {
  computeKDAScore, computeConsistencyScore, computeStreakBonus,
  computeCSScore, computeCompositePlayerScore,
  debugPrintScoringBreakdown
} from './core/scoring'

// ── Cache ────────────────────────────────────────────────────────
export { NexusCache, NexusCacheLayers, NexusCacheLayer, NexusRefCounts, debugPrintCacheStats } from './cache'
export { canonicalizeCacheKey, computeDataCompleteness, shouldReplace } from './cache'

// ── Cache / Aggregator ───────────────────────────────────────────
export { RingReducer, aggregateTeamProfile, compareTeams, debugPrintTeamComparison, debugPrintAggregatorState } from './cache/aggregator'

// ── Scheduler ────────────────────────────────────────────────────
export { NexusScheduler, createNexusScheduler, mapQueryPhaseToGamePhase, debugPrintSchedulerState } from './scheduler'

// ── Pipeline ─────────────────────────────────────────────────────
export { STAGE_REGISTRY, NEXUS_STAGES, debugPrintStageRegistry } from './pipeline/stages'
export { NexusPipeline, NexusEngine, createNexusEngine, computeHistogramPass, debugPrintHistogram, debugPrintPipelineReport, debugPrintEngineState, rankToNumeric, rankToLabel } from './pipeline/engine'

// ── Capture ──────────────────────────────────────────────────────
export { ExperimentCapture, CaptureRingBuffer, RingBuffer, DistributedAccumulator, createExperimentCapture, debugPrintCaptureStats } from './capture'
export { PrivacyScrubber, debugPrintScrubReport } from './capture/privacy-scrubber'

// ── Inference ────────────────────────────────────────────────────
export { NexusInference, debugPrintInferenceReport } from './inference'

// ── Decision ─────────────────────────────────────────────────────
export { DecisionCoordinator } from './decision'

// ── Streaming ────────────────────────────────────────────────────
export { NexusStreamServer } from './streaming'

// ── Replay ───────────────────────────────────────────────────────
export { ReplayAnalyzer } from './replay'

// ── Observable Store ─────────────────────────────────────────────
export { ObservableStore } from './observable'

// ── A/B Testing ──────────────────────────────────────────────────
export { ABTestEngine } from './abtest'

// ── Profiling ────────────────────────────────────────────────────
export { ProfilingEngine } from './profiling'

// ── Ontology: Store ──────────────────────────────────────────────
export { ObjectStore, createObjectStore } from './ontology/store/object-store'
export type { OntologyObjectType, OntologyLinkType, ObjectEntry, LinkEntry, ObjectStoreChange } from './ontology/store/object-store'
export { ObjectSet, createObjectSet } from './ontology/store/object-set'
export type { WhereClause, OrderByField, AggregationClause, AggregationResult } from './ontology/store/object-set'

// ── Ontology: Pipeline ───────────────────────────────────────────
export { TransformPipeline, createTransformPipeline } from './ontology/pipeline/transform-pipeline'

// ── Ontology: Ingestion ──────────────────────────────────────────
export { LiveIngestor, SnapshotDiffer, EventClassifier, DerivedTimeSeriesEngine, createLiveIngestor, debugPrintIngestorStats } from './ontology/ingestion/live-ingestor'
export type { LiveGameEvent, LiveEventType, GameSnapshot, PlayerSnapshot, DerivedTimeSeries, LiveIngestorConfig, LiveIngestorStats } from './ontology/ingestion/live-ingestor'
export { MetaIngestor, ChampionMetaCache, OpggNormalizer, FandomBalanceMerger, createMetaIngestor, debugPrintMetaIngestorReport } from './ontology/ingestion/meta-ingestor'
export type { ChampionMeta, ChampionMetaWithBalance, CounterMatchup, RunePageMeta, ItemBuildMeta, BalanceModifiers, MetaIngestorConfig } from './ontology/ingestion/meta-ingestor'

// ── Ontology: Observable Client ──────────────────────────────────
export { ObservableClient, BatchNotifier, SubscriptionGroup, createObservableClient, debugPrintObservableReport } from './ontology/observable/observable-client'
export type { ObjectObserverPayload, QueryObserverPayload, LinkObserverPayload, AggregateObserverPayload, SubscriptionDescriptor, ObservableClientStats } from './ontology/observable/observable-client'
