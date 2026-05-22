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
  type MinimalCoachClient,
  type MinimalCoachClientParams,
  type MinimalCoachClientMetadata,
  type CoachClientCacheKey,
  type CoachRequestContext
} from './MinimalCoachContext'

export {
  createMinimalCoachClient
} from './createMinimalCoachClient'

export {
  createPlatformCoachClient,
  type PlatformCoachClient
} from './createPlatformCoachClient'

export {
  fetchCoachMetadataInternal
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
  createGeotimeSeriesProperty
} from './createGeotimeSeriesProperty'

export {
  createMediaFromReference
} from './createMediaFromReference'

export {
  createMediaReferenceProperty
} from './createMediaReferenceProperty'

export {
  createTimeseriesProperty
} from './createTimeseriesProperty'
