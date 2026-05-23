export { augment } from '../coach-object/fetchPage'
export { getWireObjectSet, isObjectSet } from '../coach-pipeline/createObjectSet'

export {

  getCoachConfig
} from '../coach-public-utils/coachConfig'
export type { CoachConfig } from '../coach-public-utils/coachConfig'

export { createCoachClientFullWithTransaction } from '../coach-client/createCoachClientFull'

export {
  applyShapeTransformations,
  applyShapeTransformationsToArray,
  buildPipelineFromRelationDef,
  getRelationQueryOptions
} from '../coach-shapes/index'

export type { ActionSignatureFromDef } from '../coach-actions/applyAction'
export { createObservableClient } from '../coach-observable/observable/ObservableClient'
export type {
  CacheEntry,
  CacheSnapshot,
  CanonicalizedOptions,
  CanonicalizeOptionsInput,
  ObservableClient,
  ObserveAggregationArgs,
  ObserveFunctionCallbackArgs,
  ObserveFunctionOptions,
  ObserveObjectCallbackArgs,
  ObserveObjectsCallbackArgs,
  ObserveObjectSetArgs,
  Unsubscribable
} from '../coach-observable/observable/ObservableClient'
export type { Observer } from '../coach-observable/observable/ObservableClient/common'
export type { ObserveLinks } from '../coach-observable/observable/ObservableClient/ObserveLink'
export type { QueryParameterType, QueryReturnType } from '../coach-queries/types'
