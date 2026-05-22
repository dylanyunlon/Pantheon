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

import type { CollectionStorageData } from "../base-list/BaseCollectionQuery.js";
import type { CacheKey } from "../CacheKey.js";
import type { Canonical } from "../Canonical.js";
import type { Rdp } from "../RdpCanonicalizer.js";
import type { ObjectSetQuery } from "./ObjectSetQuery.js";

export interface ObjectSetStorageData extends CollectionStorageData {}

export interface ObjectSetOperations {
  where?: Canonical<any>;
  withProperties?: Canonical<Rdp>;
  union?: string[];
  intersect?: string[];
  subtract?: string[];
  pivotTo?: string;
  orderBy?: Canonical<Record<string, "asc" | "desc" | undefined>>;
  select?: Canonical<readonly string[]>;
  pageSize?: number;
  loadPropertySecurity?: true;
}

export interface ObjectSetCacheKey extends
  CacheKey<
    "objectSet",
    ObjectSetStorageData,
    ObjectSetQuery,
    [
      baseObjectSetWire: string,
      operations: Canonical<ObjectSetOperations>,
    ]
  >
{
}
