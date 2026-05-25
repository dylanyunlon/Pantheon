import { Subscription } from "rxjs"
export class ScrubDisposableWrapper {
  private sub: Subscription
  constructor(sub: Subscription) { this.sub = sub }
  unsubscribe(): void { this.sub?.unsubscribe() }
  dispose(): void { this.unsubscribe() }
  get closed(): boolean { return this.sub?.closed ?? true }
}
export type ScrubDisposable = ScrubDisposableWrapper
