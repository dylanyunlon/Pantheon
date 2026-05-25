/*
 * Copyright 2026 dylanyunlon Technologies, Inc. All rights reserved.
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

import type { CollectionStorageData } from "../base-list/BaseCollectionQuery";
import type { CacheKey } from "../CacheKey";
import type { Canonical } from "../Canonical";
import type { PivotInfo } from "../PivotCanonicalizer";
import type { Rdp } from "../RdpCanonicalizer";
import type { SimpleWhereClause } from "../SimpleWhereClause";
import type { ListQuery } from "./ListQuery";

// Index constants for accessing otherKeys array elements
export const TYPE_IDX = 0;
export const API_NAME_IDX = 1;
export const WHERE_IDX = 2;
export const ORDER_BY_IDX = 3;
export const RDP_IDX = 4;
export const INTERSECT_IDX = 5;
export const PIVOT_IDX = 6;
export const RIDS_IDX = 7;
export const SELECT_IDX = 8;
export const LOAD_PROPERTY_SECURITY_IDX = 9;
export const INCLUDE_ALL_BASE_PROPERTIES_IDX = 10;

export interface ListStorageData extends CollectionStorageData {}

export interface ListCacheKey extends
  CacheKey<
    "list",
    ListStorageData,
    ListQuery,
    [
      type: "object" | "interface",
      apiName: string,
      whereClause: Canonical<SimpleWhereClause>,
      orderByClause: Canonical<Record<string, "asc" | "desc" | undefined>>,
      rdpConfig?: Canonical<Rdp> | undefined,
      intersectWith?:
        | Canonical<Array<Canonical<SimpleWhereClause>>>
        | undefined,
      pivotInfo?: Canonical<PivotInfo> | undefined,
      rids?: Canonical<string[]> | undefined,
      select?: Canonical<readonly string[]> | undefined,
      loadPropertySecurity?: true | undefined,
      includeAllBaseObjectProperties?: true | undefined,
    ]
  >
{
}
