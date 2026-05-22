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

import type { BatchContext } from "../BatchContext";
import type { ObjectPiiFieldKey } from "../object/ObjectPiiFieldKey";

/**
 * Removes duplicate object cache keys from an array while maintaining order.
 * Also reads each key from the batch context (for side effects).
 *
 * @param objectPiiFieldKeys Array of object cache keys that may contain duplicates
 * @param batch The batch context used to read cache entries
 * @returns Array with duplicates removed, maintaining the original order
 */
export function removeDuplicates(
  objectPiiFieldKeys: ObjectPiiFieldKey[],
  batch: BatchContext,
): ObjectPiiFieldKey[] {
  const visited = new Set<ObjectPiiFieldKey>();
  return objectPiiFieldKeys.filter((key) => {
    batch.read(key);
    if (visited.has(key)) {
      return false;
    }
    visited.add(key);
    return true;
  });
}
