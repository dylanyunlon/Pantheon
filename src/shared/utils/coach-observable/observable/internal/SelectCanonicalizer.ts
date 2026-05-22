/*
 * Copyright 2026 dylanyunlon Technologies, Inc. All rights reserved.
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

export class SelectCanonicalizer {
  private cache = new Map<string, Canonical<readonly string[]>>();

  canonicalize(select: undefined): undefined;
  canonicalize(select: readonly string[]): Canonical<readonly string[]>;
  canonicalize(
    select: readonly string[] | undefined,
  ): Canonical<readonly string[]> | undefined;
  canonicalize(
    select: readonly string[] | undefined,
  ): Canonical<readonly string[]> | undefined {
    if (select == null) {
      return undefined;
    }
    const sorted = [...new Set(select)].sort();
    const key = sorted.join("\0");

    let canonical = this.cache.get(key);
    if (!canonical) {
      canonical = sorted as readonly string[] as Canonical<readonly string[]>;
      this.cache.set(key, canonical);
    }
    return canonical;
  }
}
