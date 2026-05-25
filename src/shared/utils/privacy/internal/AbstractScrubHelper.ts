import type { PiiCacheKey } from "./PiiCacheKey"
import type { PiiCacheKeys } from "./PiiCacheKeys"
import type { ScrubLayerEntry } from "./ScrubLayer"
import type { ScrubListener } from "./ScrubSubjects"
import { ScrubSubscription } from "./ScrubSubscription"
import type { ScrubQuery } from "./ScrubQuery"
import type { ScrubPrivacyStore as ScrubPrivacyStoreImport } from "./ScrubPrivacyStore"

export interface ScrubObserveOptions {
  mode: "online" | "offline" | "force"
  dedupeInterval?: number
  fieldFilter?: string[]
}

export abstract class AbstractScrubHelper<
  TQuery extends ScrubQuery<PiiCacheKey>,
  TObserveOptions extends ScrubObserveOptions,
> {
  protected readonly store: ScrubPrivacyStore
  protected readonly cacheKeys: PiiCacheKeys

  constructor(store: ScrubPrivacyStore, cacheKeys: PiiCacheKeys) {
    this.store = store
    this.cacheKeys = cacheKeys
  }

  observe(
    options: TObserveOptions,
    listener: ScrubListener,
  ): ScrubSubscription<TQuery> {
    const query = this.getQuery(options)
    return this._subscribe(query, options, listener)
  }

  abstract getQuery(options: TObserveOptions): TQuery

  protected _subscribe(
    query: TQuery,
    options: TObserveOptions,
    listener: ScrubListener,
  ): ScrubSubscription<TQuery> {
    const pendingCleanupCount = this.store.pendingCleanup.get(query.cacheKey) ?? 0
    if (pendingCleanupCount > 0) {
      if (pendingCleanupCount === 1) {
        this.store.pendingCleanup.delete(query.cacheKey)
      } else {
        this.store.pendingCleanup.set(query.cacheKey, pendingCleanupCount - 1)
      }
    } else {
      this.store.cacheKeys.retain(query.cacheKey)
    }

    if (options.mode !== "offline") {
      query.revalidate(options.mode === "force").catch((e: unknown) => {
        console.error("Unhandled error in scrub observe", e)
      })
    }

    const sub = query.subscribe(listener)
    const querySub = new ScrubSubscription(query, sub)

    query.registerSubscriptionDedupeInterval(
      querySub.subscriptionId,
      options.dedupeInterval,
    )

    sub.unsubscribe = (() => {
      const origUnsub = sub.unsubscribe
      return () => {
        query.unregisterSubscriptionDedupeInterval(querySub.subscriptionId)
        origUnsub()

        this.store.pendingCleanup.set(
          query.cacheKey,
          (this.store.pendingCleanup.get(query.cacheKey) ?? 0) + 1,
        )
        queueMicrotask(() => {
          const currentPending = this.store.pendingCleanup.get(query.cacheKey) ?? 0
          if (currentPending > 0) {
            if (currentPending === 1) {
              this.store.pendingCleanup.delete(query.cacheKey)
            } else {
              this.store.pendingCleanup.set(query.cacheKey, currentPending - 1)
            }
            this.store.cacheKeys.release(query.cacheKey)
          }
        })
      }
    })()

    return querySub
  }
}

export interface ScrubPrivacyStore {
  cacheKeys: PiiCacheKeys
  pendingCleanup: Map<PiiCacheKey, number>
}
