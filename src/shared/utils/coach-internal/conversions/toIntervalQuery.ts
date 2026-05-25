/*
 * Copyright 2026 dylanyunlon Technologies, Inc. All rights reserved.
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

import type { IntervalRule } from "../../coach-types";
import type { SearchJsonQueryV2 } from "../../coach-types";
import invariant from "tiny-invariant";

type IntervalQueryRule = Extract<
  SearchJsonQueryV2,
  { type: "interval" }
>["rule"];

export function toIntervalQueryRule(
  rule: IntervalRule,
): IntervalQueryRule {
  if (rule.$match != null) {
    if (rule.$prefixOnLastTerm) {
      return {
        type: "prefixOnLastToken",
        query: rule.$match,
      };
    }
    return {
      type: "match",
      query: rule.$match,
      ordered: rule.$ordered,
      maxGaps: rule.$maxGaps,
    };
  }
  if (rule.$and != null) {
    return {
      type: "allOf",
      rules: (rule.$and as any).map(toIntervalQueryRule),
      ordered: rule.$ordered,
      maxGaps: rule.$maxGaps,
    };
  }
  if (rule.$or != null) {
    return {
      type: "anyOf",
      rules: (rule.$or as any).map(toIntervalQueryRule),
    };
  }
  if (rule.$fuzzy != null) {
    return {
      type: "fuzzy",
      term: rule.$fuzzy,
      fuzziness: rule.$fuzziness,
    };
  }

  const _: never = rule;
  invariant(false, "Unknown interval rule type");
}
