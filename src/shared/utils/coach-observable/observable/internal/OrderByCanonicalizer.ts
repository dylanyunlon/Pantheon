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

import type { ObjectTypeDefinition } from "../../../../coach-types";
import type { OrderBy } from "../ObservableClient";
import type { Canonical } from "./Canonical";
import { WeakRefTrie } from "./WeakRefTrie";

export class OrderByCanonicalizer {
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
      > as Canonical<OrderBy<ObjectTypeDefinition>>;
      return data;
    },
  );

  canonicalize(
    orderBy: Record<string, "asc" | "desc" | undefined>,
  ): Canonical<Record<string, "asc" | "desc" | undefined>>;
  canonicalize(
    orderBy: Record<string, "asc" | "desc" | undefined> | undefined,
  ): Canonical<Record<string, "asc" | "desc" | undefined>> | undefined;
  canonicalize(
    orderBy: Record<string, "asc" | "desc" | undefined> | undefined,
  ): Canonical<Record<string, "asc" | "desc" | undefined>> | undefined {
    if (orderBy == null) {
      return undefined;
    }
    const strings = Object.entries(orderBy).flat();
    return this.#trie.lookupArray(strings);
  }
}
