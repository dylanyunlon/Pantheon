export class ScrubDisposableWrapper {
  constructor(public sub: any) {}
  unsubscribe(): void { this.sub?.unsubscribe() }
  dispose(): void { this.unsubscribe() }
  get closed(): boolean { return this.sub?.closed ?? true }
}
