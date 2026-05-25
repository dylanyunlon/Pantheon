// @ts-nocheck
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

import type { InterfaceHolder } from "../../../object/convertWireToCoachRecords/InterfaceHolder";
import type { ScrubRecord } from "../../../object/convertWireToCoachRecords/ScrubRecord";
import type { BatchContext } from "../BatchContext";
import type { ScrubNormalized } from "../ScrubNormalized";
import type { ObjectPiiFieldKey } from "../object/ObjectPiiFieldKey";
import { PK_IDX } from "../object/ObjectPiiFieldKey";

/**
 * Strategy interface for collection sorting
 */
export interface SortingStrategy {
  /**
   * Sort an array of object cache keys
   * @param objectPiiFieldKeys - Keys to sort
   * @param batch - Batch context for reading objects
   * @returns Sorted array of keys
   */
  sortPiiFieldKeys(
    objectPiiFieldKeys: ObjectPiiFieldKey[],
    batch: BatchContext,
  ): ObjectPiiFieldKey[];
}

/**
 * No-operation sorting strategy that preserves original order
 */
export class NoOpSortingStrategy implements SortingStrategy {
  sortPiiFieldKeys(
    objectPiiFieldKeys: ObjectPiiFieldKey[],
    _batch: BatchContext,
  ): ObjectPiiFieldKey[] {
    return objectPiiFieldKeys;
  }
}

type ObjectInterfaceComparer = (
  a: ScrubRecord | InterfaceHolder | undefined,
  b: ScrubRecord | InterfaceHolder | undefined,
) => number;

/**
 * Sorting strategy for OrderBy clauses
 */
export class OrderBySortingStrategy implements SortingStrategy {
  private readonly sortFns: Array<ObjectInterfaceComparer>;

  constructor(
    private readonly apiName: string,
    private readonly orderBy: ScrubNormalized<
      Record<string, "asc" | "desc" | undefined>
    >,
  ) {
    this.sortFns = createOrderBySortFns(orderBy);
  }

  sortPiiFieldKeys(
    objectPiiFieldKeys: ObjectPiiFieldKey[],
    batch: BatchContext,
  ): ObjectPiiFieldKey[] {
    if (Object.keys(this.orderBy).length === 0) {
      return objectPiiFieldKeys;
    }

    return objectPiiFieldKeys.sort((a, b) => {
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
  orderBy: ScrubNormalized<Record<string, "asc" | "desc" | undefined>>,
): ObjectInterfaceComparer[] {
  return Object.entries(orderBy).map(([key, order]) => {
    return (
      a: ScrubRecord | InterfaceHolder | undefined,
      b: ScrubRecord | InterfaceHolder | undefined,
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
