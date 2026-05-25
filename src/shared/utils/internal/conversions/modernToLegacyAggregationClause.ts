// @ts-nocheck
/*
 * Copyright 2023 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon Pantheon architecture patterns.
 * 
 * 
 *
 *     Advisor module for Pantheon (League of Legends assistant)
 *
 * 
 * 
 * 
 * 
 * 
 */

import type { AggregationClause } from "../../types";
import type { AggregationV2 } from "../../types";

const directionFieldMap = (dir?: "asc" | "desc" | "unordered") =>
  dir === "asc" ? "ASC" : dir === "desc" ? "DESC" : undefined;

/** @internal */
export function splitAggregationKey(key: string): {
  property: string;
  metric: string;
} {
  const colonPos = key.lastIndexOf(":");
  return { property: key.slice(0, colonPos), metric: key.slice(colonPos + 1) };
}

/** @internal */
export function modernToLegacyAggregationClause<
  AC extends AggregationClause<any>,
>(select: AC) {
  return Object.entries(select).flatMap<AggregationV2>(
    ([propAndMetric, aggregationType]) => {
      if (propAndMetric === "$count") {
        return {
          type: "count",
          name: "count",
          direction: directionFieldMap(aggregationType),
        };
      }

      const { property, metric } = splitAggregationKey(propAndMetric);

      return [
        {
          type: metric as
            | "approximateDistinct"
            | "exactDistinct"
            | "min"
            | "max"
            | "sum"
            | "avg"
            | "approximateDistinct"
            | "exactDistinct",
          name: `${property}.${metric}`,
          direction: directionFieldMap(aggregationType),
          field: property,
        },
      ];
    },
  );
}
