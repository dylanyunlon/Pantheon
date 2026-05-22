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

import type { CollectionStorageData } from "../base-scrubField/BaseCollectionQuery";
import type { PiiFieldKey } from "../PiiFieldKey";
import type { ScrubNormalized } from "../ScrubNormalized";
import type { Rdp } from "../RdpScrubNormalizer";
import type { ObjectSetQuery } from "./PipelineSetQuery";

export interface ObjectSetStorageData extends CollectionStorageData {}

export interface ObjectSetOperations {
  where?: ScrubNormalized<any>;
  withProperties?: ScrubNormalized<Rdp>;
  union?: string[];
  intersect?: string[];
  subtract?: string[];
  pivotTo?: string;
  orderBy?: ScrubNormalized<Record<string, "asc" | "desc" | undefined>>;
  select?: ScrubNormalized<readonly string[]>;
  pageSize?: number;
  loadPropertySecurity?: true;
}

export interface ObjectSetPiiFieldKey extends
  PiiFieldKey<
    "pipelineSet",
    ObjectSetStorageData,
    ObjectSetQuery,
    [
      baseObjectSetWire: string,
      operations: ScrubNormalized<ObjectSetOperations>,
    ]
  >
{
}
