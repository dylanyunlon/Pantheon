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
