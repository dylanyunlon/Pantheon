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

import type { AllGroupByValues, GroupByClause, GroupByRange } from "../../../coach-types";
import { DurationMapping } from "../../../coach-types";
import type {
  AggregationGroupByV2,
  AggregationRangeV2,
} from "../../../coach-types";

/** @internal */
export function modernToLegacyGroupByClause(
  groupByClause: GroupByClause<any> | undefined,
) {
  if (!groupByClause) return [];

  return Object.entries(
    groupByClause as Record<string, AllGroupByValues>,
  ).flatMap<AggregationGroupByV2>(([field, type]) => {
    if (type === "exact") {
      return [{ type, field }];
    } else if ("$exactWithLimit" in type) {
      {
        return [
          {
            type: "exact",
            field,
            maxGroupCount: type.$exactWithLimit,
          },
        ];
      }
    } else if ("$exact" in type) {
      return [
        {
          type: "exact",
          field,
          maxGroupCount: type.$exact?.$limit ?? undefined,
          defaultValue: type.$exact.$defaultValue ?? undefined,
          includeNullValues: type.$exact.$includeNullValue === true
            ? true
            : undefined,
        },
      ];
    } else if ("$fixedWidth" in type) {
      return [{
        type: "fixedWidth",
        field,
        fixedWidth: type.$fixedWidth,
      }];
    } else if ("$ranges" in type) {
      return [{
        type: "ranges",
        field,
        ranges: type.$ranges.map(range => convertRange(range)),
      }];
    } else if ("$duration" in type) {
      return [{
        type: "duration",
        field,
        value: type.$duration[0],
        unit: DurationMapping[type.$duration[1]],
      }];
    } else return [];
  });
}

function convertRange(
  range: GroupByRange<number | string>,
): AggregationRangeV2 {
  return { startValue: range[0], endValue: range[1] };
}
