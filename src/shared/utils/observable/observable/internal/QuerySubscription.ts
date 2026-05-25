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
import type {
  CommonObserveOptions,
  ObserveOptions,
} from "../ObservableClient/common";
import type { KnownCacheKey } from "./KnownCacheKey";
import type { Query } from "./Query";
import { UnsubscribableWrapper } from "./UnsubscribableWrapper";

let subscriptionIdCounter = 0;

/** @internal */
export class QuerySubscription<
  TQuery extends Query<
    KnownCacheKey,
    unknown,
    CommonObserveOptions & ObserveOptions
  >,
> extends UnsubscribableWrapper {
  /** @internal */
  query: TQuery;

  /** @internal */
  subscription: Subscription;

  /** @internal */
  subscriptionId: string;

  constructor(query: TQuery, subscription: Subscription) {
    super(subscription);
    this.query = query;
    this.subscription = subscription;
    this.subscriptionId = `sub_${++subscriptionIdCounter}`;

    // hide these from introspection
    Object.defineProperties(this, {
      query: { enumerable: false },
      subscription: { enumerable: false },
      subscriptionId: { enumerable: false },
    });
  }
}
