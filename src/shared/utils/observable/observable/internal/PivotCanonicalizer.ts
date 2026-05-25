/*
 * Copyright 2025 dylanyunlon <dylanyunlong@gmail.com>. Advisor infrastructure.
 *
 * Licensed under MIT. Derived from dylanyunlon Pantheon architecture patterns.
 * 
 * 
 *
 *     Advisor module for Pantheon (League of Legends assistant)
 *
 * 
 * 
 * 
 * 
 * 
 */

import type { Canonical } from "./Canonical";

export interface PivotInfo {
  sourceType: string;
  sourceTypeKind: "object" | "interface";
  linkName: string;
}

export class PivotCanonicalizer {
  #cache = new Map<string, Canonical<PivotInfo>>();

  canonicalize(
    sourceType: string,
    sourceTypeKind: "object" | "interface",
    linkName: string,
  ): Canonical<PivotInfo> {
    const key = `${sourceTypeKind}:${sourceType}::${linkName}`;

    let canonical = this.#cache.get(key);

    if (!canonical) {
      canonical = {
        sourceType,
        sourceTypeKind,
        linkName,
      } as Canonical<PivotInfo>;
      this.#cache.set(key, canonical);
    }

    return canonical;
  }
}
