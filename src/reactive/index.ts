// @ts-nocheck
/**
 * reactive/index.ts — barrel export for OSDK-pattern reactive layer
 */
export { ReactiveStore, createReactiveStore, debugPrintStoreSnapshot, NexusLayers, NexusLayer, NexusSubject, NexusRefCounts, createOptimisticId } from './store'
export type { NexusBatchContext, SubjectObserver, CacheEntry, CacheStatus, OptimisticId, ReactiveStoreConfig } from './store'
export { IncrementalPipeline, createIncrementalPipeline, debugPrintIncrementalReport } from './incremental-pipeline'
export type { IncrementalStage, StageDependency, IncrementalRunReport } from './incremental-pipeline'
export { OptimisticAdvisor, createOptimisticAdvisor } from './optimistic-advisor'
export type { ChampionHoverEvent, ChampionLockEvent, OptimisticAdviceResult, AdvisorConfig } from './optimistic-advisor'
export { GameBridge, createGameBridge, debugPrintBridgeState, mapGameflowPhase } from './game-bridge'
export type { GameBridgeConfig } from './game-bridge'
export { runReactiveDemo } from './run-reactive'
