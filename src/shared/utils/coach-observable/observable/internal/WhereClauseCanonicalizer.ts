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

import type {
  ObjectOrInterfaceDefinition,
  SimplePropertyDef,
  WhereClause,
} from "../../../../coach-types";
import { Trie } from "../../../../coach-types";
import deepEqual from "fast-deep-equal";
import invariant from "../../coach-util/invariant";
import type { Canonical } from "./Canonical.js";
import type { SimpleWhereClause } from "./SimpleWhereClause.js";

export class WhereClauseCanonicalizer {
  /**
   * This is a shortcut cache for any WhereClause's that we have
   * seen and already canonicalized. The theory behind this
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
    Canonical<SimpleWhereClause>
  >();

  /**
   * This is a trie that stores the sorted collapsed keys of a where clause to
   * the cache key for canonicalized options. In theory this keeps the number of
   * deepEqual comparisons down to a minimum but its probably overkill.
   */
  #trie = new Trie<object>();

  /**
   * This is a cache from the cacheKey provided by `this.#trie` to the potential
   * canonicalized options.
   */
  #existingOptions: Map<object, {
    options: WeakRef<Canonical<SimpleWhereClause>>[];
  }> = new Map();

  public canonicalize<
    T extends ObjectOrInterfaceDefinition,
    RDPs extends Record<string, SimplePropertyDef> = {},
  >(
    where: WhereClause<T, RDPs> | SimpleWhereClause,
  ): Canonical<SimpleWhereClause>;
  public canonicalize(
    where: object | undefined,
  ): Canonical<SimpleWhereClause> | undefined;
  public canonicalize<
    T extends ObjectOrInterfaceDefinition,
    RDPs extends Record<string, SimplePropertyDef> = {},
  >(
    where: WhereClause<T, RDPs> | SimpleWhereClause | undefined,
  ): Canonical<SimpleWhereClause> | undefined {
    if (where == null) {
      return undefined;
    }
    // fastest shortcut
    if (this.#cache.has(where)) {
      return this.#cache.get(where)!;
    }

    const keysSet = new Set<string>();
    const calculatedCanon = this.#toCanon(where, keysSet);
    const cacheKey = this.#trie.lookupArray(Array.from(keysSet).sort());
    const lookupEntry = this.#existingOptions.get(cacheKey)
      ?? { options: [] as WeakRef<Canonical<SimpleWhereClause>>[] };
    this.#existingOptions.set(cacheKey, lookupEntry);

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
  ): Canonical<SimpleWhereClause> => {
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
        return {} as Canonical<SimpleWhereClause>;
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
    ) as Canonical<SimpleWhereClause>;
  };
}
