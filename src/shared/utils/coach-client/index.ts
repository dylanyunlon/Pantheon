export {
  type CoachClient,
  coachClientContext,
  type MaxCoachVersion
} from './CoachClient'

export {
  createCoachClient,
  createCoachClientInternal,
  createCoachClientFromContext,
  createCoachClientWithTransaction,
  type CoachPipelineFactory
} from './createCoachClient'

export {
  type MinimalCoachClient as MinimalCoachClientLegacy,
  type MinimalCoachClientParams as MinimalCoachClientParamsLegacy,
  type MinimalCoachClientMetadata as MinimalCoachClientMetadataLegacy,
  type CoachClientCacheKey as CoachClientCacheKeyLegacy,
  type CoachRequestContext as CoachRequestContextLegacy
} from './MinimalCoachContext'

export {
  createMinimalCoachClient
} from './createMinimalCoachClient'

export {
  createPlatformCoachClient,
  type PlatformCoachClient
} from './createPlatformCoachClient'

export {
  fetchCoachMetadataInternal as fetchCoachMetadataLegacy
} from './fetchCoachMetadata'

export {
  getResults,
  applyPageToken,
  pageRequestAsAsyncIter
} from './pageRequestAsAsyncIter'

export {
  createCoachClientFromWriteable
} from './createCoachClientFromWriteable'

export {
  type ResultOrError,
  type CoachResult,
  type CoachError
} from './ResultOrError'

export {
  type SatisfiesSemver
} from './SatisfiesSemver'

export {
  GeotimeSeriesPropertyImpl as createGeotimeSeriesProperty
} from './createGeotimeSeriesProperty'

export {
  createMediaFromReference
} from './createMediaFromReference'

export {
  MediaReferencePropertyImpl as createMediaReferenceProperty
} from './createMediaReferenceProperty'

export {
  createTimeseriesProperty
} from './createTimeseriesProperty'

export {
  type CoachClientFull,
  coachClientSymbol,
  createCoachClientFullExport,
  createCoachClientFullInternal,
  createCoachClientFromCtx,
  createCoachClientFullWithTransaction
} from './createCoachClientFull'

export {
  type MinimalCoachClient,
  type MinimalCoachClientParams,
  type MinimalCoachClientMetadata,
  type CoachCacheKey,
  type CoachRequestContext
} from './MinimalCoachClientContext'

export {
  createMinimalCoachClientFull
} from './createMinimalCoachClientFull'

export {
  createMinimalCoachClientHelper
} from './createMinimalCoachClientHelper'

export {
  createPlatformCoachClientFull,
  type PlatformCoachClientFull
} from './createPlatformCoachClientFull'

export {
  fetchCoachMetadataInternal
} from './fetchCoachMetadataFull'

export {
  createCoachClientFromWriteableFull
} from './createCoachClientFromWriteableFull'
