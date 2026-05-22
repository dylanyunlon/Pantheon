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

import type { KnownCacheKey } from "./KnownCacheKey";
import type { Entry } from "./Layer";

export function createInitEntry(cacheKey: KnownCacheKey): Entry<any> {
  return {
    cacheKey,
    status: "init",
    value: undefined,
    lastUpdated: 0,
  };
}
