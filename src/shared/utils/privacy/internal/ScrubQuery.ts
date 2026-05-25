import type { PiiCacheKey } from "./PiiCacheKey"
import type { ScrubLayerEntry } from "./ScrubLayer"
import type { ScrubListener } from "./ScrubSubjects"

export type ScrubQueryStatus = "idle" | "scrubbing" | "scrubbed" | "error"

export interface ScrubQueryResult<K extends PiiCacheKey = PiiCacheKey> {
  key: K
  entry: ScrubLayerEntry<K> | undefined
  status: ScrubQueryStatus
  error?: unknown
}

export abstract class ScrubQuery<K extends PiiCacheKey> {
  readonly cacheKey: K
  private _subscribers: ScrubListener[] = []
  private _status: ScrubQueryStatus = "idle"
  private _dedupeIntervals = new Map<string, number | undefined>()

  constructor(cacheKey: K) {
    this.cacheKey = cacheKey
  }

  get status(): ScrubQueryStatus {
    return this._status
  }

  subscribe(listener: ScrubListener): { unsubscribe: () => void } {
    this._subscribers.push(listener)
    return {
      unsubscribe: () => {
        const idx = this._subscribers.indexOf(listener)
        if (idx >= 0) this._subscribers.splice(idx, 1)
      },
    }
  }

  notifySubscribers(entry: ScrubLayerEntry): void {
    for (const subscriber of this._subscribers) {
      try { subscriber(entry) } catch (_) {}
    }
  }

  registerSubscriptionDedupeInterval(subId: string, interval: number | undefined): void {
    this._dedupeIntervals.set(subId, interval)
  }

  unregisterSubscriptionDedupeInterval(subId: string): void {
    this._dedupeIntervals.delete(subId)
  }

  abstract revalidate(force: boolean): Promise<void>

  get subscriberCount(): number {
    return this._subscribers.length
  }

  protected setStatus(status: ScrubQueryStatus): void {
    this._status = status
  }
}
