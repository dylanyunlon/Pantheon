export { CoachCacheLayer, CoachCacheLayers } from './layer'
export type { CacheEntry } from './layer'
export { CoachRefCounts } from './ref-counts'
export {
  canonicalizeCacheKey,
  computeDataCompleteness,
  shouldReplace
} from './canonicalizer'
export type { CoachCacheKeyParams } from './canonicalizer'
export {
  CoachDataTracker,
  createCoachChanges
} from './query'
export type {
  CoachDataType,
  CoachQueryStatus,
  CoachQueryKey,
  CoachSubjectPayload,
  CoachChanges,
  CoachBatchContext,
  DataAvailability
} from './query'
export {
  aggregateTeamProfile,
  compareTeams,
  RingReducer,
  BatchAggregationContext
} from './aggregator'
export type {
  AggregationDimension,
  DimensionWeight,
  AggregatedTeamProfile,
  TeamComparisonResult
} from './aggregator'
