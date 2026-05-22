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

export class DefaultMap<K, V> extends Map<K, V> {
  #factory: (key: K) => V;

  constructor(factory: (key: K) => V) {
    super();
    this.#factory = factory;
  }

  override get(key: K): V {
    if (!super.has(key)) {
      super.set(key, this.#factory(key));
    }
    return super.get(key)!;
  }
}
