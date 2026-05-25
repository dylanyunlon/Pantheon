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
