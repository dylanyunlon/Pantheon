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

import type { Changes } from "./Changes.js";
import type { KnownCacheKey } from "./KnownCacheKey.js";
import type { Entry } from "./Layer.js";

export interface BatchContext {
  changes: Changes;
  createLayerIfNeeded: () => void;
  optimisticWrite: boolean;

  write: <K extends KnownCacheKey>(
    k: K,
    v: Entry<K>["value"],
    status: Entry<K>["status"],
  ) => Entry<K>;

  read: <K extends KnownCacheKey>(
    k: K,
  ) => Entry<K> | undefined;

  delete: <K extends KnownCacheKey>(
    k: K,
    status: Entry<K>["status"],
  ) => Entry<K>;
}
