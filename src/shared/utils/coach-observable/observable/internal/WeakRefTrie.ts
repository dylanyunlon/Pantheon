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

import { Trie } from "@wry/trie";

const defaultMakeData = () => Object.create(null);

/**
 * The `WeakRefTrie` class uses weak references to store data, allowing for automatic garbage collection
 * of entries that are no longer in use.
 *
 * The original trie from @wry/trie does not do automatic cleanup of old entries.
 */
export class WeakRefTrie<X extends object> {
  #finalizer = new FinalizationRegistry<
    Array<string>
  >((orderBy) => {
    this.#trie.removeArray(
      Object.entries(orderBy).flat(),
    );
  });

  #trie: Trie<WeakRef<X>>;

  constructor(makeData: (array: any[]) => X = defaultMakeData) {
    this.#trie = new Trie<WeakRef<X>>(
      false,
      (array) => {
        const data = makeData(array);
        this.#finalizer.register(data, array);
        return new WeakRef(data);
      },
    );
  }

  lookupArray<T extends IArguments | any[]>(array: T): X {
    const maybe = this.#trie.lookupArray(array);
    let ret = maybe.deref();
    if (maybe && !ret) {
      // in case finalizer hasn't run
      this.#trie.removeArray(array);
      ret = this.#trie.lookupArray(array).deref();
    }
    return ret!;
  }

  peekArray<T extends IArguments | any[]>(array: T): X | undefined {
    const maybe = this.#trie.peekArray(array);
    const ret = maybe?.deref();
    if (maybe && !ret) {
      // in case finalizer hasn't run
      this.#trie.removeArray(array);
    }
    return ret;
  }

  removeArray<T extends IArguments | any[]>(array: T): X | undefined {
    return this.#trie.removeArray(array)?.deref();
  }
}
