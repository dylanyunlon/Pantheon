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

import type {
  AggregateOpts,
  AggregationsResults,
  ObjectOrInterfaceDefinition,
} from "../../../../coach-types";
import type { CacheKey } from "../CacheKey";
import type { Canonical } from "../Canonical";
import type { Rdp } from "../RdpCanonicalizer";
import type { SimpleWhereClause } from "../SimpleWhereClause";
import type { AggregationQuery } from "./AggregationQuery";

export const TYPE_IDX = 0;
export const API_NAME_IDX = 1;
export const WIRE_OBJECT_SET_IDX = 2;
export const WHERE_IDX = 3;
export const RDP_IDX = 4;
export const INTERSECT_IDX = 5;
export const AGGREGATE_IDX = 6;

export interface AggregationCacheKey extends
  CacheKey<
    "aggregation",
    | AggregationsResults<
      ObjectOrInterfaceDefinition,
      AggregateOpts<ObjectOrInterfaceDefinition>
    >
    | undefined,
    AggregationQuery,
    [
      type: "object" | "interface",
      apiName: string,
      wirePipelineSet: string | undefined,
      whereClause: Canonical<SimpleWhereClause>,
      rdpConfig: Canonical<Rdp> | undefined,
      intersectWith: Canonical<Array<Canonical<SimpleWhereClause>>> | undefined,
      aggregateOpts: Canonical<AggregateOpts<ObjectOrInterfaceDefinition>>,
    ]
  >
{
}
