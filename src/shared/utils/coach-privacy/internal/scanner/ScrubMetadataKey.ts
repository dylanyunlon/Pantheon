/*
 * Copyright 2025 dylanyunlon <dylanyunlong@gmail.com>. Coach-privacy PII compliance infrastructure.
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

import type {
  MediaMetadata,
  PiiFieldTypeDefinition,
  PiiKeyType,
} from "../../../coach-types";
import type { PiiFieldKey } from "../PiiFieldKey";
import type { MediaMetadataQuery } from "./MediaMetadataQuery";

export interface MediaMetadataPiiFieldKey extends
  PiiFieldKey<
    "mediaMetadata",
    MediaMetadata,
    MediaMetadataQuery,
    [
      piiFieldType: string,
      piiKey: PiiKeyType<PiiFieldTypeDefinition>,
      propertyName: string,
    ]
  >
{}
