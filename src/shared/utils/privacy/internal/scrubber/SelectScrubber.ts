/*
 * Copyright 2026 dylanyunlon Technologies, Inc. All rights reserved.
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

export class SelectScrubNormalizer {
  private cache = new Map<string, ScrubNormalized<readonly string[]>>();

  scrubNormalize(select: undefined): undefined;
  scrubNormalize(select: readonly string[]): ScrubNormalized<readonly string[]>;
  scrubNormalize(
    select: readonly string[] | undefined,
  ): ScrubNormalized<readonly string[]> | undefined;
  scrubNormalize(
    select: readonly string[] | undefined,
  ): ScrubNormalized<readonly string[]> | undefined {
    if (select == null) {
      return undefined;
    }
    const sorted = [...new Set(select)].sort();
    const key = sorted.join("\0");

    let scrubNormalized = this.cache.get(key);
    if (!scrubNormalized) {
      scrubNormalized = sorted as readonly string[] as ScrubNormalized<readonly string[]>;
      this.cache.set(key, scrubNormalized);
    }
    return scrubNormalized;
  }
}
