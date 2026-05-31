// @ts-nocheck
/**
 * nexus-engine — unified public API
 *
 * All modules re-exported for single-import usage:
 *   import { NexusEngine, NexusIntrospector, ... } from 'nexus-engine'
 */

// ── Debug / Introspection ────────────────────────────────────────────
export { NexusIntrospector, StructWatcher } from './debug/introspector'
export { dumpAllState } from './debug/dump-all'
export { runMockPipeline } from './debug/run-pipeline'

// ── Core Types ───────────────────────────────────────────────────────
export type {
  PlayerAnalysis, MatchSummary, RankedEntry, ChampionProfile,
  LaneMatchup, TeamProfile, DamageProfile, ThreatAssessment,
  AdviceItem, PipelineContext, PipelineRunReport, StageTimingEntry
} from './types'

// ── Core Scoring ─────────────────────────────────────────────────────
export {
  computeKDAScore, computeConsistencyScore, computeStreakBonus,
  computeCSScore, computeCompositePlayerScore,
  debugPrintScoringBreakdown
} from './core/scoring'

// ── Cache ────────────────────────────────────────────────────────────
export { NexusCache, debugPrintCacheStats } from './cache'
export { TeamAggregator, RingReducer, debugPrintAggregatorState } from './cache/aggregator'

// ── Scheduler ────────────────────────────────────────────────────────
export { AdviceScheduler, debugPrintSchedulerState } from './scheduler'

// ── Pipeline ─────────────────────────────────────────────────────────
export { STAGE_REGISTRY, NEXUS_STAGES } from './pipeline/stages'
export { NexusPipeline, NexusEngine, debugPrintPipelineReport } from './pipeline/engine'

// ── Capture ──────────────────────────────────────────────────────────
export { ExperimentCapture, CaptureRingBuffer, debugPrintCaptureStats } from './capture'
export { PrivacyScrubber, debugPrintScrubReport } from './capture/privacy-scrubber'

// ── Inference ────────────────────────────────────────────────────────
export { NexusInference, debugPrintInferenceReport } from './inference'

// ── Decision ─────────────────────────────────────────────────────────
export { DecisionCoordinator, debugPrintDecisionReport } from './decision'

// ── Streaming ────────────────────────────────────────────────────────
export { NexusStreamServer, debugPrintStreamReport } from './streaming'

// ── Replay ───────────────────────────────────────────────────────────
export { ReplayAnalyzer, debugPrintReplayReport } from './replay'

// ── Observable Store ─────────────────────────────────────────────────
export { ObservableStore, debugPrintObservableStoreReport } from './observable'

// ── A/B Testing ──────────────────────────────────────────────────────
export { ABTestEngine, debugPrintABTestReport } from './abtest'

// ── Profiling ────────────────────────────────────────────────────────
export { ProfilingEngine, debugPrintProfilingReport } from './profiling'

// ── Ontology: Store ──────────────────────────────────────────────────
export { ObjectStore, createObjectStore } from './ontology/store/object-store'
export type { OntologyObjectType, OntologyLinkType, ObjectEntry, LinkEntry, ObjectStoreChange } from './ontology/store/object-store'
export { ObjectSet, createObjectSet } from './ontology/store/object-set'
export type { WhereClause, OrderByField, AggregationClause, AggregationResult } from './ontology/store/object-set'

// ── Ontology: Pipeline ───────────────────────────────────────────────
export { TransformPipeline, createTransformPipeline } from './ontology/pipeline/transform-pipeline'

// ── Ontology: Ingestion ──────────────────────────────────────────────
export { LiveIngestor, SnapshotDiffer, EventClassifier, DerivedTimeSeriesEngine, createLiveIngestor, debugPrintIngestorStats } from './ontology/ingestion/live-ingestor'
export type { LiveGameEvent, LiveEventType, GameSnapshot, PlayerSnapshot, DerivedTimeSeries, LiveIngestorConfig, LiveIngestorStats } from './ontology/ingestion/live-ingestor'
export { MetaIngestor, ChampionMetaCache, OpggNormalizer, FandomBalanceMerger, createMetaIngestor, debugPrintMetaIngestorReport } from './ontology/ingestion/meta-ingestor'
export type { ChampionMeta, ChampionMetaWithBalance, CounterMatchup, RunePageMeta, ItemBuildMeta, BalanceModifiers, MetaIngestorConfig } from './ontology/ingestion/meta-ingestor'

// ── Ontology: Observable Client ──────────────────────────────────────
export { ObservableClient, BatchNotifier, SubscriptionGroup, createObservableClient, debugPrintObservableReport } from './ontology/observable/observable-client'
export type { ObjectObserverPayload, QueryObserverPayload, LinkObserverPayload, AggregateObserverPayload, SubscriptionDescriptor, ObservableClientStats } from './ontology/observable/observable-client'
