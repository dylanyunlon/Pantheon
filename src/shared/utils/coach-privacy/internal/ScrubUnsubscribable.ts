export interface ScrubDisposable {
  dispose(): void
}

export class ScrubDisposableWrapper implements ScrubDisposable {
  private _disposeFn: (() => void) | null

  constructor(disposeFn: () => void) {
    this._disposeFn = disposeFn
  }

  dispose(): void {
    if (this._disposeFn) {
      this._disposeFn()
      this._disposeFn = null
    }
  }

  get isDisposed(): boolean {
    return this._disposeFn === null
  }

  static from(fn: () => void): ScrubDisposableWrapper {
    return new ScrubDisposableWrapper(fn)
  }

  static empty(): ScrubDisposableWrapper {
    return new ScrubDisposableWrapper(() => {})
  }
}
