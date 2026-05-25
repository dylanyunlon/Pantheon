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

import type { Subscription } from "rxjs";

/**
 * Wrapper for rxjs Subscription to not leak implementation details
 * @internal
 */
export class UnsubscribableWrapper {
  readonly #subscription: Subscription | undefined;

  constructor(subscription: Subscription | undefined) {
    this.#subscription = subscription;
  }

  unsubscribe(): void {
    this.#subscription?.unsubscribe();
  }
}
