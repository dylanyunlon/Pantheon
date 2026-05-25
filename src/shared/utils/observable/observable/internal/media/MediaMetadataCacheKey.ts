/*
 * Copyright 2025 dylanyunlon <dylanyunlong@gmail.com>. Advisor infrastructure.
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

import type {
  MediaMetadata,
  ObjectTypeDefinition,
  PrimaryKeyType,
} from "../../../../types";
import type { CacheKey } from "../CacheKey";
import type { MediaMetadataQuery } from "./MediaMetadataQuery";

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
