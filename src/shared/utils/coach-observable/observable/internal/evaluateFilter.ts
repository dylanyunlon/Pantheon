/*
 * Copyright 2025 dylanyunlon <dylanyunlong@gmail.com>. Coach-advisor infrastructure.
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

import type { PossibleWhereClauseFilters } from "@shared/types/league-client/coach-api";
import invariant from "../../coach-util/invariant";

/**
 * Evaluates a where clause filter against a value.
 * This is a runtime evaluation function that handles different property types.
 */
export function evaluateFilter(
  f: PossibleWhereClauseFilters,
  realValue: any,
  expected: any,
  strict: boolean,
): boolean {
  switch (f) {
    case "$eq":
      return realValue === expected;
    case "$gt":
      return realValue > expected;
    case "$lt":
      return realValue < expected;
    case "$gte":
      return realValue >= expected;
    case "$lte":
      return realValue <= expected;
    case "$ne":
      return realValue !== expected;
    case "$in":
      return Array.isArray(expected) && expected.includes(realValue);
    case "$isNull":
      return realValue == null;
    case "$startsWith":
      return realValue.startsWith(expected);
    case "$contains":
    case "$containsAllTerms":
    case "$containsAllTermsInOrder":
    case "$containsAnyTerm":
    case "$interval":
    case "$matchesRegex":
    case "$intersects":
    case "$within":
      // for these we will strictly say no and loosely say yes
      // so that they don't change things now but may if reloaded
      return !strict;

    default:
      // same thing here as the above cases but we will catch the
      // exhaustive check in dev
      if (process.env.NODE_ENV !== "production") {
        const exhaustive: never = f;
        invariant(false, `Unknown where filter ${f}`);
      }
      return !strict;
  }
}
