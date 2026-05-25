export class ScrubDisposableWrapper {
  private _closed = false
  constructor(private teardown?: () => void) {}
  unsubscribe(): void { if (!this._closed) { this._closed = true; this.teardown?.() } }
  dispose(): void { this.unsubscribe() }
  get closed(): boolean { return this._closed }
}
export type ScrubDisposable = ScrubDisposableWrapper
