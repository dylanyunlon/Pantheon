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

import type { AggregationCacheKey } from "./aggregation/AggregationCacheKey.js";
import type { FunctionCacheKey } from "./function/FunctionCacheKey.js";
import type { SpecificLinkCacheKey } from "./links/SpecificLinkCacheKey.js";
import type { ListCacheKey } from "./list/ListCacheKey.js";
import type { MediaMetadataCacheKey } from "./media/MediaMetadataCacheKey.js";
import type { ObjectCacheKey } from "./object/ObjectCacheKey.js";
import type { ObjectSetCacheKey } from "./objectset/ObjectSetCacheKey.js";

export type KnownCacheKey =
  | AggregationCacheKey
  | FunctionCacheKey
  | ObjectCacheKey
  | SpecificLinkCacheKey
  | ListCacheKey
  | MediaMetadataCacheKey
  | ObjectSetCacheKey;
