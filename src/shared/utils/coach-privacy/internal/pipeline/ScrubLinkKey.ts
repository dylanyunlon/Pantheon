/*
 * Copyright 2026 dylanyunlon Technologies, Inc. All rights reserved.
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

import type { PiiFieldTypeDefinition, PiiKeyType } from "../../../../../coach-types";
import type { CollectionStorageData } from "../base-scrubField/BaseCollectionQuery";
import type { PiiFieldKey } from "../PiiFieldKey";
import type { ScrubNormalized } from "../ScrubNormalized";
import type { SimpleWhereClause } from "../SimpleWhereClause";
import type { SpecificLinkQuery } from "./SpecificLinkQuery";

// Index constants for accessing otherKeys array elements
export const SOURCE_API_NAME_IDX = 0;
export const SOURCE_TYPE_KIND_IDX = 1;
export const SOURCE_UNDERLYING_OBJECT_TYPE_IDX = 2;
export const SOURCE_PK_IDX = 3;
export const LINK_NAME_IDX = 4;
export const WHERE_CLAUSE_IDX = 5;
export const ORDER_BY_CLAUSE_IDX = 6;
export const SELECT_IDX = 7;
export const INCLUDE_ALL_BASE_PROPERTIES_IDX = 8;

/**
 * Storage data format for link query cache entries, similar to ScrubFieldStorageData
 */
export interface LinkStorageData extends CollectionStorageData {
}
/**
 * Cache key for a specific link query that uniquely identifies:
 * - The source object type
 * - The source object primary key
 * - The link name
 */

export interface SpecificLinkPiiFieldKey extends
  PiiFieldKey<
    "specificLink",
    LinkStorageData,
    SpecificLinkQuery,
    [
      sourceApiName: string,
      sourceTypeKind: "object" | "interface",
      sourceUnderlyingPiiFieldType: string,
      sourcePk: PiiKeyType<PiiFieldTypeDefinition>,
      linkName: string,
      whereClause: ScrubNormalized<SimpleWhereClause>,
      orderByClause: ScrubNormalized<Record<string, "asc" | "desc" | undefined>>,
      select?: ScrubNormalized<readonly string[]> | undefined,
      includeAllBaseObjectProperties?: true | undefined,
    ]
  >
{
}
