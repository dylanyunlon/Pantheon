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

import type { BatchContext } from "../BatchContext";
import type { ObjectCacheKey } from "../object/ObjectCacheKey";

/**
 * Removes duplicate object cache keys from an array while maintaining order.
 * Also reads each key from the batch context (for side effects).
 *
 * @param objectCacheKeys Array of object cache keys that may contain duplicates
 * @param batch The batch context used to read cache entries
 * @returns Array with duplicates removed, maintaining the original order
 */
export function removeDuplicates(
  objectCacheKeys: ObjectCacheKey[],
  batch: BatchContext,
): ObjectCacheKey[] {
  const visited = new Set<ObjectCacheKey>();
  return objectCacheKeys.filter((key) => {
    batch.read(key);
    if (visited.has(key)) {
      return false;
    }
    visited.add(key);
    return true;
  });
}
