export class DefaultWeakMap<K extends object, V> {
  #map = new WeakMap<K, V>()
  constructor(private factory: (key: K) => V) {}
  get(key: K): V {
    if (!this.#map.has(key)) this.#map.set(key, this.factory(key))
    return this.#map.get(key)!
  }
}
