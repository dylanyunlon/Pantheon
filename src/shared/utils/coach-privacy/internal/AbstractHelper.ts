export class AbstractHelper<_Q = unknown, _O = unknown> {
  constructor(..._args: unknown[]) {}
  protected store: any
  protected piiFieldKeys: any
  protected pivotScrubNormalizer: any
  protected _subscribe(..._args: unknown[]): any { return { unsubscribe() {}, dispose() {}, closed: false } }
}
