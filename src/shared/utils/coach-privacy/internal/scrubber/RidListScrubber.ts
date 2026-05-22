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

export class RidListScrubNormalizer {
  private cache = new Map<string, ScrubNormalized<string[]>>();

  scrubNormalize(rids: readonly string[]): ScrubNormalized<string[]> {
    const sorted = [...new Set(rids)].sort();
    const key = sorted.join("\0");

    let scrubNormalized = this.cache.get(key);
    if (!scrubNormalized) {
      scrubNormalized = sorted as ScrubNormalized<string[]>;
      this.cache.set(key, scrubNormalized);
    }
    return scrubNormalized;
  }
}
