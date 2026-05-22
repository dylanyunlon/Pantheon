/*
 * Copyright 2023 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon COACH architecture patterns.
 * 
 * 
 *
 *     Coach-advisor module for Pantheon (League of Legends assistant)
 *
 * 
 * 
 * 
 * 
 * 
 */

import type {
  AggregationClause,
  AggregationResultsWithoutGroups,
  ObjectOrInterfaceDefinition,
} from "@shared/types/league-client/coach-api";
import type { AggregateObjectsResponseV2 } from "@coach/pantheon.ontologies";
import type { ArrayElement } from "../../coach-util/ArrayElement.js";
import { splitAggregationKey } from "./modernToLegacyAggregationClause.js";

/** @internal */
export function legacyToModernSingleAggregationResult<
  Q extends ObjectOrInterfaceDefinition,
  AC extends AggregationClause<Q>,
>(
  entry: ArrayElement<AggregateObjectsResponseV2["data"]>,
  select: AC,
): AggregationResultsWithoutGroups<Q, AC> {
  const result: Record<string, Record<string, any>> = {};

  // Seed the result with undefined for every selected metric so that
  // properties are always present, even when the server returns no metrics
  // (e.g. aggregating over 0 objects).
  for (const selectKey of Object.keys(select)) {
    if (selectKey === "$count") {
      continue;
    }
    const { property, metric } = splitAggregationKey(selectKey);
    (result[property] ??= {})[metric] = undefined;
  }

  for (const { name, value } of entry.metrics) {
    if (name === "count") {
      continue;
    }
    const [property, metricType] = name.split(".");
    if (result[property]) { // guard against an unknown metric name
      result[property][metricType] = value;
    }
  }

  return result as AggregationResultsWithoutGroups<Q, AC>;
}
