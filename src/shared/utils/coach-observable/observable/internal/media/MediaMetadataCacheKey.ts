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
  MediaMetadata,
  ObjectTypeDefinition,
  PrimaryKeyType,
} from "../../../../../coach-types";
import type { CacheKey } from "../CacheKey.js";
import type { MediaMetadataQuery } from "./MediaMetadataQuery.js";

export interface MediaMetadataCacheKey extends
  CacheKey<
    "mediaMetadata",
    MediaMetadata,
    MediaMetadataQuery,
    [
      objectType: string,
      primaryKey: PrimaryKeyType<ObjectTypeDefinition>,
      propertyName: string,
    ]
  >
{}
