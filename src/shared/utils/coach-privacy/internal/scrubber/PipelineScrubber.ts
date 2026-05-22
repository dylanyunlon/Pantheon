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

import type { ScrubNormalized } from "./ScrubNormalized";
import { WeakRefTrie } from "./WeakRefTrie";

export class ObjectSetArrayScrubNormalizer {
  #unionTrie = new WeakRefTrie<string[]>();
  #intersectTrie = new WeakRefTrie<string[]>();
  #subtractTrie = new WeakRefTrie<string[]>();

  scrubNormalizeUnion(items: string[]): ScrubNormalized<string[]> {
    const sorted = [...items].sort();
    return this.#unionTrie.lookupArray(sorted) as ScrubNormalized<string[]>;
  }

  scrubNormalizeIntersect(items: string[]): ScrubNormalized<string[]> {
    const sorted = [...items].sort();
    return this.#intersectTrie.lookupArray(sorted) as ScrubNormalized<string[]>;
  }

  scrubNormalizeSubtract(items: string[]): ScrubNormalized<string[]> {
    return this.#subtractTrie.lookupArray(items) as ScrubNormalized<string[]>;
  }
}
