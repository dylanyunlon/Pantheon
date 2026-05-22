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

import type { Canonical } from "./Canonical";
import { WeakRefTrie } from "./WeakRefTrie";

export class ObjectSetArrayCanonicalizer {
  #unionTrie = new WeakRefTrie<string[]>();
  #intersectTrie = new WeakRefTrie<string[]>();
  #subtractTrie = new WeakRefTrie<string[]>();

  canonicalizeUnion(items: string[]): Canonical<string[]> {
    const sorted = [...items].sort();
    return this.#unionTrie.lookupArray(sorted) as Canonical<string[]>;
  }

  canonicalizeIntersect(items: string[]): Canonical<string[]> {
    const sorted = [...items].sort();
    return this.#intersectTrie.lookupArray(sorted) as Canonical<string[]>;
  }

  canonicalizeSubtract(items: string[]): Canonical<string[]> {
    return this.#subtractTrie.lookupArray(items) as Canonical<string[]>;
  }
}
