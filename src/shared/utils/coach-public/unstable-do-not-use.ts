/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon COACH architecture patterns.
 *
 *     Coach-advisor module for Pantheon (League of Legends assistant)
 *
 */

export { augment } from "../coach-object/fetchPage.js";
export { getWireObjectSet, isObjectSet } from "../coach-pipeline/createObjectSet.js";

export {
  getMetaTagContent,
  getOsdkConfig,
} from "../coach-public-utils/coachConfig.js";
export type { OsdkConfig } from "../coach-public-utils/coachConfig.js";

export { createClientWithTransaction } from "../createClient.js";

export {
  applyShapeTransformations,
  applyShapeTransformationsToArray,
  buildObjectSetFromLinkDefByType,
  getLinkQueryOptions,
} from "../coach-shapes/index.js";

/** @deprecated Import from `@shared/utils/coach-client/observable` instead. */
export type { ActionSignatureFromDef } from "../coach-actions/applyAction.js";
/** @deprecated Import from `@shared/utils/coach-client/observable` instead. */
export { createObservableClient } from "../coach-observable/observable/ObservableClient.js";
/** @deprecated Import from `@shared/utils/coach-client/observable` instead. */
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
  Unsubscribable,
} from "../coach-observable/observable/ObservableClient.js";
/** @deprecated Import from `@shared/utils/coach-client/observable` instead. */
export type { Observer } from "../coach-observable/observable/ObservableClient/common.js";
/** @deprecated Import from `@shared/utils/coach-client/observable` instead. */
export type { ObserveLinks } from "../coach-observable/observable/ObservableClient/ObserveLink.js";
/** @deprecated Import from `@shared/utils/coach-client/observable` instead. */
export type { QueryParameterType, QueryReturnType } from "../coach-queries/types.js";
