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

import type { PiiFieldTypeDefinition } from "../../../../coach-types";
import type { OrderBy } from "../PrivacyScrubClient";
import type { ScrubNormalized } from "./ScrubNormalized";
import { WeakRefTrie } from "./WeakRefTrie";

export class OrderByScrubNormalizer {
  #trie = new WeakRefTrie(
    (array: Array<string>) => {
      const pairs = array.reduce<Array<[string, "asc" | "desc"]>>(
        (result, _, index, array) => {
          if (index % 2 === 0 && array[index] != null) {
            result.push(
              array.slice(index, index + 2) as [string, "asc" | "desc"],
            );
          }
          return result;
        },
        [],
      );
      const data = Object.fromEntries(pairs) satisfies Record<
        string,
        "asc" | "desc"
      > as ScrubNormalized<OrderBy<PiiFieldTypeDefinition>>;
      return data;
    },
  );

  scrubNormalize(
    orderBy: Record<string, "asc" | "desc" | undefined>,
  ): ScrubNormalized<Record<string, "asc" | "desc" | undefined>>;
  scrubNormalize(
    orderBy: Record<string, "asc" | "desc" | undefined> | undefined,
  ): ScrubNormalized<Record<string, "asc" | "desc" | undefined>> | undefined;
  scrubNormalize(
    orderBy: Record<string, "asc" | "desc" | undefined> | undefined,
  ): ScrubNormalized<Record<string, "asc" | "desc" | undefined>> | undefined {
    if (orderBy == null) {
      return undefined;
    }
    const strings = Object.entries(orderBy).flat();
    return this.#trie.lookupArray(strings);
  }
}
