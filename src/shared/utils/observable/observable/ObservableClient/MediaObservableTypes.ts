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

import type { MediaMetadata } from "../../../types";
import type { Status } from "./common";

export interface MediaMetadataPayload {
  metadata: MediaMetadata | undefined;
  status: Status;
  lastUpdated: number;
  isOptimistic: boolean;
}

export interface MediaMetadataObserveOptions {
  mode?: "offline" | "force";
  dedupeInterval?: number;
  preview?: boolean;
}

export interface MediaContentPayload {
  metadata: MediaMetadata | undefined;
  content: Blob | undefined;
  url: string | undefined;
  previewUrl: string | undefined;
  dimensions: { width: number; height: number } | undefined;
  status: Status;
  isStale: boolean;
  isPreview: boolean;
  lastUpdated: number;
  error: Error | undefined;
}

export interface MediaContentObserveOptions {
  dedupeInterval?: number;
  preview?: boolean;
  placeholder?: "preview" | "none";
  priority?: "high" | "low";
  staleTime?: number;
}
