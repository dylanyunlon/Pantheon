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

import type { KnownCacheKey } from "./KnownCacheKey";
import { WeakMapWithEntries } from "./WeakMapWithEntries";

/*
  Image some layers

  [
    { cache: { obj1: { a: 1 } }, layerId: undefined },
    { cache: { obj1: { a: 1, b: 2 } }, layerId: "layer1" },
    { cache: { obj1: { a: undefined, b: 2 } }, layerId: "layer2" },
    { cache: { obj1: { a: 1, b: 2 } }, layerId: "layer3" },
  ]
*/

export class Layer {
  #parent: Layer | undefined;
  #cache = new WeakMapWithEntries<KnownCacheKey, Entry<any>>();
  #layerId: unknown;

  constructor(parent: Layer | undefined, layerId: unknown) {
    this.#parent = parent;
    this.#layerId = layerId;
  }

  get parentLayer(): Layer | undefined {
    return this.#parent;
  }

  get layerId(): unknown {
    return this.#layerId;
  }

  addLayer(layerId: unknown): Layer {
    return new Layer(this, layerId);
  }

  removeLayer(layerId: unknown): Layer {
    if (layerId == null || this.#parent == null) {
      // we are the root, so we can't remove anything
      return this;
    }

    if (this.#layerId !== layerId) {
      this.#parent = this.#parent.removeLayer(layerId);
      return this;
    }

    return this.#parent.removeLayer(layerId);
  }

  entries(): IterableIterator<[KnownCacheKey, Entry<any>]> {
    return this.#cache.entries();
  }

  keys(): IterableIterator<KnownCacheKey> {
    return this.#cache.keys();
  }

  public get<K extends KnownCacheKey>(
    cacheKey: K,
  ): Entry<K> | undefined {
    return this.#cache.get(cacheKey) as Entry<K> | undefined
      ?? this.#parent?.get(cacheKey) as Entry<K> | undefined;
  }

  public set<K extends KnownCacheKey>(
    cacheKey: K,
    value: Entry<K>,
  ): void {
    this.#cache.set(cacheKey, value);
  }
}

export interface Entry<K extends KnownCacheKey> {
  readonly cacheKey: K;
  value: K["__cacheKey"]["value"] | undefined;
  lastUpdated: number;
  status: "init" | "loading" | "loaded" | "error";
}
