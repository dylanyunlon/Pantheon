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

import type { Canonical } from "./Canonical.js";

export class RidListCanonicalizer {
  private cache = new Map<string, Canonical<string[]>>();

  canonicalize(rids: readonly string[]): Canonical<string[]> {
    const sorted = [...new Set(rids)].sort();
    const key = sorted.join("\0");

    let canonical = this.cache.get(key);
    if (!canonical) {
      canonical = sorted as Canonical<string[]>;
      this.cache.set(key, canonical);
    }
    return canonical;
  }
}
