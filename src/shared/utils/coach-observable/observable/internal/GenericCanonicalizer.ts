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

import { Trie } from "@wry/trie";
import deepEqual from "fast-deep-equal";
import type { Canonical } from "./Canonical";
import { CachingCanonicalizer } from "./Canonicalizer";

// Limits how deep we recurse into nested objects when building the trie
// fingerprint. Beyond this depth, objects land in the same trie bucket and
// deepEqual handles disambiguation.
const MAX_FINGERPRINT_DEPTH = 5;

export class GenericCanonicalizer extends CachingCanonicalizer<object, object> {
  #trie = new Trie<object>();
  #existingValues: Map<object, { values: WeakRef<Canonical<object>>[] }> =
    new Map();

  canonicalize<T extends object>(input: T): Canonical<T>;
  canonicalize<T extends object>(
    input: T | undefined,
  ): Canonical<T> | undefined;
  canonicalize<T extends object>(
    input: T | undefined,
  ): Canonical<T> | undefined {
    return super.canonicalize(input as object) as Canonical<T> | undefined;
  }

  protected lookupOrCreate(input: object): Canonical<object> {
    const structuralKey = this.#collectSortedKeys(input);
    const cacheKey = this.#trie.lookupArray(structuralKey);
    const entry = this.#existingValues.get(cacheKey)
      ?? { values: [] as WeakRef<Canonical<object>>[] };
    this.#existingValues.set(cacheKey, entry);

    for (let i = entry.values.length - 1; i >= 0; i--) {
      const existing = entry.values[i].deref();
      if (!existing) {
        entry.values.splice(i, 1);
        continue;
      }
      if (deepEqual(existing, input)) {
        return existing;
      }
    }

    const canonical = input as Canonical<object>;
    entry.values.push(new WeakRef(canonical));
    return canonical;
  }

  #collectSortedKeys(obj: unknown, depth = 0): string[] {
    if (depth > MAX_FINGERPRINT_DEPTH || !obj || typeof obj !== "object") {
      return [];
    }
    if (Array.isArray(obj)) {
      const result = ["[]", String(obj.length)];
      for (const item of obj) {
        result.push(...this.#collectSortedKeys(item, depth + 1));
      }
      return result;
    }
    const record = obj as Record<string, unknown>;
    const result: string[] = [];
    for (const key of Object.keys(record).sort()) {
      result.push(key);
      result.push(...this.#collectSortedKeys(record[key], depth + 1));
    }
    return result;
  }
}
