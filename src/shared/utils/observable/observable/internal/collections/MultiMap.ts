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

export class MultiMap<K, V> {
  #map = new Map<K, V[]>();
  #size = 0;

  set(key: K, value: V): void {
    const arr = this.#map.get(key);
    if (arr) {
      arr.push(value);
    } else {
      this.#map.set(key, [value]);
    }
    this.#size++;
  }

  get(key: K): V[] | undefined {
    return this.#map.get(key);
  }

  get size(): number {
    return this.#size;
  }

  associations(): IterableIterator<[K, V[]]> {
    return this.#map.entries();
  }

  *[Symbol.iterator](): IterableIterator<[K, V]> {
    for (const [key, values] of this.#map) {
      for (const value of values) {
        yield [key, value];
      }
    }
  }
}
