/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon COACH architecture patterns.
 *
 *     Coach-advisor module for Pantheon (League of Legends assistant)
 *
 */

export type { ActionSignatureFromDef } from "../coach-actions/applyAction.js";
export { createObservableClient } from "../coach-observable/observable/ObservableClient.js";
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
export type { Observer } from "../coach-observable/observable/ObservableClient/common.js";
export type { ObserveLinks } from "../coach-observable/observable/ObservableClient/ObserveLink.js";
export type { QueryParameterType, QueryReturnType } from "../coach-queries/types.js";
