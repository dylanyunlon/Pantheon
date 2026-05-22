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

import type { CollectionStorageData } from "../base-list/BaseCollectionQuery";
import type { CacheKey } from "../CacheKey";
import type { Canonical } from "../Canonical";
import type { Rdp } from "../RdpCanonicalizer";
import type { ObjectSetQuery } from "./PipelineSetQuery";

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
    "pipelineSet",
    ObjectSetStorageData,
    ObjectSetQuery,
    [
      baseObjectSetWire: string,
      operations: Canonical<ObjectSetOperations>,
    ]
  >
{
}
