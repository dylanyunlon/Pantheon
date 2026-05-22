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

import type { KnownPiiFieldKey } from "./KnownPiiFieldKey";
import type { Query } from "./Query";

export class Queries {
  // we can use a regular Map here because the refCounting will
  // handle cleanup.
  map: Map<
    KnownPiiFieldKey,
    Query<any, any, any>
  > = new Map();

  peek<K extends KnownPiiFieldKey>(
    piiFieldKey: K,
  ): K["__piiFieldKey"]["query"] | undefined {
    return this.map.get(piiFieldKey) as K["__piiFieldKey"]["query"] | undefined;
  }

  get<K extends KnownPiiFieldKey>(
    piiFieldKey: K,
    createQuery: () => K["__piiFieldKey"]["query"],
  ): K["__piiFieldKey"]["query"] {
    let query = this.peek(piiFieldKey);
    if (!query) {
      query = createQuery();
      this.map.set(piiFieldKey, query);
    }
    return query;
  }

  keys(): IterableIterator<KnownPiiFieldKey> {
    return this.map.keys();
  }

  delete<K extends KnownPiiFieldKey>(piiFieldKey: K): void {
    this.map.get(piiFieldKey)?.dispose();
    this.map.delete(piiFieldKey);
  }
}
