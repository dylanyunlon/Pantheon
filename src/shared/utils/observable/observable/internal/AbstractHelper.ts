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

import type {
  CommonObserveOptions,
  Observer,
} from "../ObservableClient/common";
import type { BaseListPayloadShape } from "./base-list/BaseListQuery";
import type { CacheKeys } from "./CacheKeys";
import type { KnownCacheKey } from "./KnownCacheKey";
import { ListQueryView, type ListQueryViewTarget } from "./ListQueryView";
import type { Query } from "./Query";
import { QuerySubscription } from "./QuerySubscription";
import type { Store } from "./Store";

/**
 * Check if a query supports view-based pagination (has the required methods).
 * Generic over PAYLOAD to preserve type information when the guard passes.
 */
function supportsViews<PAYLOAD extends BaseListPayloadShape>(
  query: unknown,
): query is ListQueryViewTarget<PAYLOAD> {
  return (
    query != null
    && typeof (query as ListQueryViewTarget<PAYLOAD>).registerFetchPageSize
      === "function"
    && typeof (query as ListQueryViewTarget<PAYLOAD>).getLoadedCount
      === "function"
    && typeof (query as ListQueryViewTarget<PAYLOAD>).hasMorePages
      === "function"
    && typeof (query as ListQueryViewTarget<PAYLOAD>).notifySubscribers
      === "function"
    && typeof (query as ListQueryViewTarget<PAYLOAD>).fetchMore === "function"
  );
}

/**
 * Options that may include list-specific pagination settings.
 */
interface ListObserveOptions {
  pageSize?: number;
  autoFetchMore?: boolean | number;
}

export abstract class AbstractHelper<
  TQuery extends Query<KnownCacheKey, any, CommonObserveOptions>,
  TObserveOptions extends CommonObserveOptions,
> {
  protected readonly store: Store;
  protected readonly cacheKeys: CacheKeys<KnownCacheKey>;

  constructor(store: Store, cacheKeys: CacheKeys<KnownCacheKey>) {
    this.store = store;
    this.cacheKeys = cacheKeys;
  }

  observe(
    options: TObserveOptions,
    subFn: Observer<
      TQuery extends Query<any, infer PAYLOAD, any> ? PAYLOAD : never
    >,
  ): QuerySubscription<TQuery> {
    const query = this.getQuery(options);
    return this._subscribe(query, options, subFn);
  }

  abstract getQuery(options: TObserveOptions): TQuery;

  protected _subscribe<
    PAYLOAD extends (TQuery extends Query<any, infer P, any> ? P : never),
  >(
    query: TQuery,
    options: TObserveOptions,
    subFn: Observer<PAYLOAD>,
  ): QuerySubscription<TQuery> {
    // the ListQuery represents the shared state of the list
    // If there is a deferred release pending for this key (from a prior
    // unmount), cancel exactly one pending release and avoid an extra retain.
    // This keeps refcounts balanced during unmount→remount within the same tick
    // (e.g. React StrictMode effect cleanup + re-run).
    const pendingCleanupCount = this.store.pendingCleanup.get(query.cacheKey)
      ?? 0;
    if (pendingCleanupCount > 0) {
      if (pendingCleanupCount === 1) {
        this.store.pendingCleanup.delete(query.cacheKey);
      } else {
        this.store.pendingCleanup.set(
          query.cacheKey,
          pendingCleanupCount - 1,
        );
      }
    } else {
      this.store.cacheKeys.retain(query.cacheKey);
    }

    if (options.mode !== "offline") {
      query.revalidate(options.mode === "force").catch((e: unknown) => {
        subFn.error(e);

        // we don't want observeObject() to return a promise,
        // so we settle for logging an error here instead of
        // dropping it on the floor.
        if (this.store.logger) {
          this.store.logger.error("Unhandled error in observeObject", e);
        } else {
          throw e;
        }
      });
    }

    // For queries that support views (list-like queries), wrap with ListQueryView
    // to handle per-subscriber view data such as pageSize
    const listOptions = options as ListObserveOptions;
    const useView = supportsViews<PAYLOAD & BaseListPayloadShape>(query)
      && (listOptions.pageSize !== undefined
        || listOptions.autoFetchMore !== undefined);

    const sub = useView
      ? new ListQueryView<PAYLOAD & BaseListPayloadShape>(
        query,
        listOptions.pageSize ?? 100,
        listOptions.autoFetchMore,
      ).subscribe(subFn as Observer<PAYLOAD & BaseListPayloadShape>)
      : query.subscribe(subFn);

    const querySub = new QuerySubscription(query, sub);

    query.registerSubscriptionDedupeInterval(
      querySub.subscriptionId,
      options.dedupeInterval,
    );

    sub.add(() => {
      query.unregisterSubscriptionDedupeInterval(querySub.subscriptionId);

      // Defer the release to the next microtask so React unmount-remount
      // cycles can re-subscribe before the cache key is released.
      // This prevents propagateWrite from skipping keys that are
      // momentarily between subscriptions.
      //
      // Note: microtask ordering is only guaranteed within a single
      // queueMicrotask call, not across separate invocations. If
      // additional microtasks are introduced that interact with
      // pendingCleanup or cacheKeys, ensure they don't rely on
      // running before or after this one.
      this.store.pendingCleanup.set(
        query.cacheKey,
        (this.store.pendingCleanup.get(query.cacheKey) ?? 0) + 1,
      );
      queueMicrotask(() => {
        const currentPending = this.store.pendingCleanup.get(query.cacheKey)
          ?? 0;
        if (currentPending > 0) {
          if (currentPending === 1) {
            this.store.pendingCleanup.delete(query.cacheKey);
          } else {
            this.store.pendingCleanup.set(query.cacheKey, currentPending - 1);
          }
          this.store.cacheKeys.release(query.cacheKey);
        }
      });
    });

    return querySub;
  }
}
