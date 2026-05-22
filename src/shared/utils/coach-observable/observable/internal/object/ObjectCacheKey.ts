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

import type { ObjectTypeDefinition, PrimaryKeyType } from "../../../../../coach-types";
import type { ObjectHolder } from "../../../object/convertWireToCoachRecords/ObjectHolder";
import type { CacheKey } from "../CacheKey";
import type { Canonical } from "../Canonical";
import type { Rdp } from "../RdpCanonicalizer";
import type { ObjectQuery } from "./ObjectQuery";

// Index constants for accessing otherKeys array elements
export const API_NAME_IDX = 0;
export const PK_IDX = 1;
export const RDP_CONFIG_IDX = 2;
export const SELECT_IDX = 3;
export const LOAD_PROPERTY_SECURITY_IDX = 4;
export const INCLUDE_ALL_BASE_PROPERTIES_IDX = 5;

export interface ObjectCacheKey extends
  CacheKey<
    "object",
    ObjectHolder,
    ObjectQuery,
    [
      apiName: string,
      pk: PrimaryKeyType<ObjectTypeDefinition>,
      rdpConfig?: Canonical<Rdp> | undefined,
      select?: Canonical<readonly string[]> | undefined,
      loadPropertySecurity?: true | undefined,
      includeAllBaseObjectProperties?: true | undefined,
    ]
  >
{
}
