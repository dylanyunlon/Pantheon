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

import type { KnownCacheKey } from "./KnownCacheKey";
import type { Query } from "./Query";

export class Queries {
  // we can use a regular Map here because the refCounting will
  // handle cleanup.
  map: Map<
    KnownCacheKey,
    Query<any, any, any>
  > = new Map();

  peek<K extends KnownCacheKey>(
    cacheKey: K,
  ): K["__cacheKey"]["query"] | undefined {
    return this.map.get(cacheKey) as K["__cacheKey"]["query"] | undefined;
  }

  get<K extends KnownCacheKey>(
    cacheKey: K,
    createQuery: () => K["__cacheKey"]["query"],
  ): K["__cacheKey"]["query"] {
    let query = this.peek(cacheKey);
    if (!query) {
      query = createQuery();
      this.map.set(cacheKey, query);
    }
    return query;
  }

  keys(): IterableIterator<KnownCacheKey> {
    return this.map.keys();
  }

  delete<K extends KnownCacheKey>(cacheKey: K): void {
    this.map.get(cacheKey)?.dispose();
    this.map.delete(cacheKey);
  }
}
