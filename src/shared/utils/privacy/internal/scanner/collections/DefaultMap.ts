export class DefaultMap<K, V> extends Map<K, V> {
  constructor(private factory: () => V) { super() }
  getOrCreate(key: K): V {
    if (!this.has(key)) this.set(key, this.factory())
    return this.get(key)!
  }
}
