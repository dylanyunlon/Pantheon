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

import type { KnownCacheKey } from "./KnownCacheKey.js";
import type { Entry } from "./Layer.js";

export interface SubjectPayload<KEY extends KnownCacheKey> extends Entry<KEY> {
  isOptimistic: boolean;
}
