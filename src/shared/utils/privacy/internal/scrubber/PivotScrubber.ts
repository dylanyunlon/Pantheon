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

export interface PivotInfo {
  sourceType: string;
  sourceTypeKind: "object" | "interface";
  linkName: string;
}

export class PivotScrubNormalizer {
  #cache = new Map<string, ScrubNormalized<PivotInfo>>();

  scrubNormalize(
    sourceType: string,
    sourceTypeKind: "object" | "interface",
    linkName: string,
  ): ScrubNormalized<PivotInfo> {
    const key = `${sourceTypeKind}:${sourceType}::${linkName}`;

    let scrubNormalized = this.#cache.get(key);

    if (!scrubNormalized) {
      scrubNormalized = {
        sourceType,
        sourceTypeKind,
        linkName,
      } as ScrubNormalized<PivotInfo>;
      this.#cache.set(key, scrubNormalized);
    }

    return scrubNormalized;
  }
}
