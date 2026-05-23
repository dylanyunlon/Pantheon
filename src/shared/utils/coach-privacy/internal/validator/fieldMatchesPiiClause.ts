/*
 * Copyright 2025 dylanyunlon <dylanyunlong@gmail.com>. Coach-privacy PII compliance infrastructure.
 *
 * Licensed under MIT. Derived from dylanyunlon COACH architecture patterns.
 * 
 * 
 *
 *     Privacy compliance module for Pantheon (League of Legends assistant)
 *
 * 
 * 
 * 
 * 
 * 
 */

import type { PossibleWhereClauseFilters } from "../../../coach-types";
import deepEqual from "fast-deep-equal";
import invariant from "tiny-invariant";
import type { InterfaceHolder } from "../../coach-object/convertWireToCoachRecords/InterfaceHolder";
import type { ScrubRecord } from "../../coach-object/convertWireToCoachRecords/ScrubRecord";
import { evaluateFilter } from "./evaluateFilter";
import type { SimpleWhereClause } from "./SimpleWhereClause";

function is$and(
  whereClause: SimpleWhereClause,
): whereClause is { $and: SimpleWhereClause[] } {
  if (process.env.NODE_ENV !== "production") {
    if ("$and" in whereClause) {
      invariant(
        Array.isArray(whereClause.$and),
        "expected $and to be an array",
      );
      invariant(
        Object.keys(whereClause).length === 1,
        "expected only $and to be present",
      );
    }
  }
  return "$and" in whereClause;
}

function is$or(
  whereClause: SimpleWhereClause,
): whereClause is { $or: SimpleWhereClause[] } {
  if (process.env.NODE_ENV !== "production") {
    if ("$or" in whereClause) {
      invariant(
        Array.isArray(whereClause.$or),
        "expected $or to be an array",
      );
      invariant(
        Object.keys(whereClause).length === 1,
        "expected only $or to be present",
      );
    }
  }
  return "$or" in whereClause;
}

function is$not(
  whereClause: SimpleWhereClause,
): whereClause is { $not: SimpleWhereClause } {
  if (process.env.NODE_ENV !== "production") {
    if ("$not" in whereClause) {
      invariant(
        Object.keys(whereClause).length === 1,
        "expected only $not to be present",
      );
    }
  }

  return "$not" in whereClause;
}

export function objectSortaMatchesWhereClause(
  o: ScrubRecord | InterfaceHolder,
  whereClause: SimpleWhereClause,
  strict: boolean,
): boolean {
  if (deepEqual({}, whereClause)) {
    return true;
  }

  if (is$and(whereClause)) {
    return whereClause.$and.every(w =>
      objectSortaMatchesWhereClause(o, w, strict)
    );
  }
  if (is$or(whereClause)) {
    return whereClause.$or.some(w =>
      objectSortaMatchesWhereClause(o, w, strict)
    );
  }
  if (is$not(whereClause)) {
    return !objectSortaMatchesWhereClause(o, whereClause.$not, strict);
  }

  return Object.entries(whereClause).every(([key, filter]) => {
    if (typeof filter === "object" && filter != null) {
      const realValue: any = o[key as keyof typeof o];
      const [f] = Object.keys(filter) as Array<PossibleWhereClauseFilters>;
      const expected = (filter as any)[f];
      return evaluateFilter(f, realValue, expected, strict);
    }

    if (key in o) {
      if (o[key as keyof typeof o] === filter) {
        return true;
      }
    }
    return false;
  });
}
