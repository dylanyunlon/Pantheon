import type { PiiCacheKey } from "./PiiCacheKey"
import type { ScrubQuery } from "./ScrubQuery"

let _subscriptionCounter = 0

export class ScrubSubscription<Q extends ScrubQuery<PiiCacheKey>> {
  readonly query: Q
  readonly subscriptionId: string
  private _unsubscribe: (() => void) | null

  constructor(query: Q, subscription: { unsubscribe: () => void }) {
    this.query = query
    _subscriptionCounter++
    this.subscriptionId = `scrub-sub-${_subscriptionCounter}`
    this._unsubscribe = subscription.unsubscribe
  }

  unsubscribe(): void {
    if (this._unsubscribe) {
      this._unsubscribe()
      this._unsubscribe = null
    }
  }

  get isActive(): boolean {
    return this._unsubscribe !== null
  }
}
