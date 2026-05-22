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

import type { AggregationCacheKey } from "./aggregation/AggregationCacheKey";
import type { FunctionCacheKey } from "./function/FunctionCacheKey";
import type { SpecificLinkCacheKey } from "./links/SpecificLinkCacheKey";
import type { ListCacheKey } from "./list/ListCacheKey";
import type { MediaMetadataCacheKey } from "./media/MediaMetadataCacheKey";
import type { ObjectCacheKey } from "./object/ObjectCacheKey";
import type { ObjectSetCacheKey } from "./objectset/PipelineSetCacheKey";

export type KnownCacheKey =
  | AggregationCacheKey
  | FunctionCacheKey
  | ObjectCacheKey
  | SpecificLinkCacheKey
  | ListCacheKey
  | MediaMetadataCacheKey
  | ObjectSetCacheKey;
