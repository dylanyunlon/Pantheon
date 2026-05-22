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

import type { Logger } from "@shared/types/league-client/coach-api";
import { BehaviorSubject } from "rxjs";
import { createInitEntry } from "./createInitEntry.js";
import type { KnownCacheKey } from "./KnownCacheKey.js";
import type { Entry } from "./Layer.js";
import { type Layers } from "./Layers.js";
import type { SubjectPayload } from "./SubjectPayload.js";

export class Subjects {
  #layers: Layers;

  // we can use a regular Map here because the refCounting will
  // handle cleanup.
  #cacheKeyToSubject = new WeakMap<
    KnownCacheKey,
    BehaviorSubject<SubjectPayload<any>>
  >();

  logger?: Logger;

  constructor({ logger, layers }: { logger?: Logger; layers: Layers }) {
    this.logger = logger;
    this.#layers = layers;
  }

  peek = <KEY extends KnownCacheKey>(
    cacheKey: KEY,
  ):
    | BehaviorSubject<SubjectPayload<KEY>>
    | undefined =>
  {
    return this.#cacheKeyToSubject.get(cacheKey);
  };

  get = <KEY extends KnownCacheKey>(
    cacheKey: KEY,
  ): BehaviorSubject<SubjectPayload<KEY>> => {
    let subject = this.#cacheKeyToSubject.get(cacheKey);
    if (!subject) {
      const initialValue: Entry<KEY> = this.#layers.top.get(cacheKey)
        ?? createInitEntry(cacheKey);

      subject = new BehaviorSubject({
        ...initialValue,
        isOptimistic:
          initialValue.value !== this.#layers.truth.get(cacheKey)?.value,
      });
      this.#cacheKeyToSubject.set(cacheKey, subject);
    }

    return subject;
  };

  delete = <KEY extends KnownCacheKey>(
    cacheKey: KEY,
  ): void => {
    const subject = this.peek(cacheKey);
    if (subject) {
      subject.complete();
      this.#cacheKeyToSubject.delete(cacheKey);
    }
  };
}
