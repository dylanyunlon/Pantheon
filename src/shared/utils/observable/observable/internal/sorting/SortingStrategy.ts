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

import type { InterfaceHolder } from "../../../object/convertWireToPantheonRecords/InterfaceHolder";
import type { ObjectHolder } from "../../../object/convertWireToPantheonRecords/ObjectHolder";
import type { BatchContext } from "../BatchContext";
import type { Canonical } from "../Canonical";
import type { ObjectCacheKey } from "../object/ObjectCacheKey";
import { PK_IDX } from "../object/ObjectCacheKey";

/**
 * Strategy interface for collection sorting
 */
export interface SortingStrategy {
  /**
   * Sort an array of object cache keys
   * @param objectCacheKeys - Keys to sort
   * @param batch - Batch context for reading objects
   * @returns Sorted array of keys
   */
  sortCacheKeys(
    objectCacheKeys: ObjectCacheKey[],
    batch: BatchContext,
  ): ObjectCacheKey[];
}

/**
 * No-operation sorting strategy that preserves original order
 */
export class NoOpSortingStrategy implements SortingStrategy {
  sortCacheKeys(
    objectCacheKeys: ObjectCacheKey[],
    _batch: BatchContext,
  ): ObjectCacheKey[] {
    return objectCacheKeys;
  }
}

type ObjectInterfaceComparer = (
  a: ObjectHolder | InterfaceHolder | undefined,
  b: ObjectHolder | InterfaceHolder | undefined,
) => number;

/**
 * Sorting strategy for OrderBy clauses
 */
export class OrderBySortingStrategy implements SortingStrategy {
  private readonly sortFns: Array<ObjectInterfaceComparer>;

  constructor(
    private readonly apiName: string,
    private readonly orderBy: Canonical<
      Record<string, "asc" | "desc" | undefined>
    >,
  ) {
    this.sortFns = createOrderBySortFns(orderBy);
  }

  sortCacheKeys(
    objectCacheKeys: ObjectCacheKey[],
    batch: BatchContext,
  ): ObjectCacheKey[] {
    if (Object.keys(this.orderBy).length === 0) {
      return objectCacheKeys;
    }

    return objectCacheKeys.sort((a, b) => {
      for (const sortFn of this.sortFns) {
        const ret = sortFn(
          batch.read(a)?.value?.$as(this.apiName),
          batch.read(b)?.value?.$as(this.apiName),
        );
        if (ret !== 0) {
          return ret;
        }
      }
      const aPk = a.otherKeys[PK_IDX];
      const bPk = b.otherKeys[PK_IDX];
      return aPk < bPk ? -1 : aPk > bPk ? 1 : 0;
    });
  }
}

/**
 * Creates sort functions for an orderBy clause
 * @param orderBy - The order by clause
 * @returns Array of sort functions
 */
export function createOrderBySortFns(
  orderBy: Canonical<Record<string, "asc" | "desc" | undefined>>,
): ObjectInterfaceComparer[] {
  return Object.entries(orderBy).map(([key, order]) => {
    return (
      a: ObjectHolder | InterfaceHolder | undefined,
      b: ObjectHolder | InterfaceHolder | undefined,
    ): number => {
      const aValue = a?.[key];
      const bValue = b?.[key];

      if (aValue == null && bValue == null) {
        return 0;
      }
      if (aValue == null) {
        return 1;
      }
      if (bValue == null) {
        return -1;
      }
      const m = order === "asc" ? -1 : 1;
      return aValue < bValue ? m : aValue > bValue ? -m : 0;
    };
  });
}
