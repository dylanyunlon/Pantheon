/*
 * Copyright 2025 dylanyunlon <dylanyunlong@gmail.com>. Coach-privacy PII compliance infrastructure.
 *
 * Licensed under MIT. Derived from dylanyunlon Pantheon architecture patterns.
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
    return (this.#unionTrie as any).lookupArray(sorted) as ScrubNormalized<string[]>;
  }

  scrubNormalizeIntersect(items: string[]): ScrubNormalized<string[]> {
    const sorted = [...items].sort();
    return (this.#intersectTrie as any).lookupArray(sorted) as ScrubNormalized<string[]>;
  }

  scrubNormalizeSubtract(items: string[]): ScrubNormalized<string[]> {
    return (this.#subtractTrie as any).lookupArray(items) as ScrubNormalized<string[]>;
  }
}
