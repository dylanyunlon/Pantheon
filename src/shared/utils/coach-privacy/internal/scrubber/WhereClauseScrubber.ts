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

import type {
  ObjectOrInterfaceDefinition,
  SimplePropertyDef,
  WhereClause,
} from "../../../coach-types";
import { Trie } from "@wry/trie";
import deepEqual from "fast-deep-equal";
import invariant from "tiny-invariant";
import type { ScrubNormalized } from "./ScrubNormalized";
import type { SimpleWhereClause } from "./SimpleWhereClause";

export class WhereClauseScrubNormalizer {
  /**
   * This is a shortcut cache for any WhereClause's that we have
   * seen and already scrubNormalized. The theory behind this
   * is that well behaving React applications will either `useMemo`
   * their where clause, or store it in state or pass it through as
   * props such that we are likely to get the same WhereClause
   * object multiple times and we can skip unnecessary work.
   */
  #cache = new WeakMap<
    | WhereClause<
      ObjectOrInterfaceDefinition,
      Record<string, SimplePropertyDef>
    >
    | SimpleWhereClause,
    ScrubNormalized<SimpleWhereClause>
  >();

  /**
   * This is a trie that stores the sorted collapsed keys of a where clause to
   * the cache key for scrubNormalized options. In theory this keeps the number of
   * deepEqual comparisons down to a minimum but its probably overkill.
   */
  #trie = new Trie<object>();

  /**
   * This is a cache from the piiFieldKey provided by `this.#trie` to the potential
   * scrubNormalized options.
   */
  #existingOptions: Map<object, {
    options: WeakRef<ScrubNormalized<SimpleWhereClause>>[];
  }> = new Map();

  public scrubNormalize<
    T extends ObjectOrInterfaceDefinition,
    RDPs extends Record<string, SimplePropertyDef> = {},
  >(
    where: WhereClause<T, RDPs> | SimpleWhereClause,
  ): ScrubNormalized<SimpleWhereClause>;
  public scrubNormalize(
    where: object | undefined,
  ): ScrubNormalized<SimpleWhereClause> | undefined;
  public scrubNormalize<
    T extends ObjectOrInterfaceDefinition,
    RDPs extends Record<string, SimplePropertyDef> = {},
  >(
    where: WhereClause<T, RDPs> | SimpleWhereClause | undefined,
  ): ScrubNormalized<SimpleWhereClause> | undefined {
    if (where == null) {
      return undefined;
    }
    // fastest shortcut
    if (this.#cache.has(where)) {
      return this.#cache.get(where)!;
    }

    const keysSet = new Set<string>();
    const calculatedCanon = this.#toCanon(where, keysSet);
    const piiFieldKey = this.#trie.lookupArray(Array.from(keysSet).sort());
    const lookupEntry = this.#existingOptions.get(piiFieldKey)
      ?? { options: [] as WeakRef<ScrubNormalized<SimpleWhereClause>>[] };
    this.#existingOptions.set(piiFieldKey, lookupEntry);

    const canon =
      lookupEntry.options.find((ref) => deepEqual(ref.deref(), calculatedCanon))
        ?.deref()
        ?? calculatedCanon;

    if (canon === calculatedCanon) {
      // This means no existing options were found
      lookupEntry.options.push(new WeakRef(canon));
    }

    this.#cache.set(where, canon);
    return canon;
  }

  #toCanon = <
    T extends ObjectOrInterfaceDefinition,
    RDPs extends Record<string, SimplePropertyDef> = {},
  >(
    where: WhereClause<T, RDPs> | SimpleWhereClause,
    set: Set<string> = new Set<string>(),
  ): ScrubNormalized<SimpleWhereClause> => {
    if ("$and" in where) {
      if (process.env.NODE_ENV !== "production") {
        invariant(Array.isArray(where.$and), "expected $and to be an array");
        invariant(
          Object.keys(where).length === 1,
          "expected only $and to be present",
        );
      }
      if ((where as { $and: SimpleWhereClause[] }).$and.length === 0) {
        // empty $and is a no-op
        return {} as ScrubNormalized<SimpleWhereClause>;
      }
      if ((where as { $and: SimpleWhereClause[] }).$and.length === 1) {
        return this.#toCanon(
          (where as { $and: SimpleWhereClause[] }).$and[0],
          set,
        );
      }
    }
    // This is incomplete for all the cases possible but it gets us started

    return Object.fromEntries(
      Object.entries(where)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => {
          set.add(k);
          if (k === "$and" || k === "$or") {
            return [
              k,
              (v as Array<SimpleWhereClause>).map(x => this.#toCanon(x, set)),
            ];
          }
          if (
            k !== "$not" && typeof v === "object" && v != null && "$eq" in v
          ) {
            return [k, v.$eq];
          }
          return [k, v];
        }),
    ) as ScrubNormalized<SimpleWhereClause>;
  };
}
