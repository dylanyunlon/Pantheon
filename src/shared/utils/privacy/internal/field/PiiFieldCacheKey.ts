/*
 * Copyright 2026 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon Pantheon architecture patterns.
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

import type { CollectionStorageData } from "../base-scrubField/BaseCollectionQuery";
import type { PiiFieldKey } from "../PiiFieldKey";
import type { ScrubNormalized } from "../ScrubNormalized";
import type { PivotInfo } from "../PivotScrubNormalizer";
import type { Rdp } from "../RdpScrubNormalizer";
import type { SimpleWhereClause } from "../SimpleWhereClause";
import type { ScrubFieldQuery } from "./ScrubFieldQuery";

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

export interface ScrubFieldStorageData extends CollectionStorageData {}

export interface ScrubFieldPiiFieldKey extends
  PiiFieldKey<
    "scrubField",
    ScrubFieldStorageData,
    ScrubFieldQuery,
    [
      type: "object" | "interface",
      apiName: string,
      whereClause: ScrubNormalized<SimpleWhereClause>,
      orderByClause: ScrubNormalized<Record<string, "asc" | "desc" | undefined>>,
      rdpConfig?: ScrubNormalized<Rdp> | undefined,
      intersectWith?:
        | ScrubNormalized<Array<ScrubNormalized<SimpleWhereClause>>>
        | undefined,
      pivotInfo?: ScrubNormalized<PivotInfo> | undefined,
      rids?: ScrubNormalized<string[]> | undefined,
      select?: ScrubNormalized<readonly string[]> | undefined,
      loadPropertySecurity?: true | undefined,
      includeAllBaseObjectProperties?: true | undefined,
    ]
  >
{
}
