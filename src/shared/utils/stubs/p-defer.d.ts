declare module 'p-defer' {
  export interface DeferredPromise<T = void> {
    promise: Promise<T>
    resolve(value: T | PromiseLike<T>): void
    reject(reason?: unknown): void
  }

  export default function pDefer<T = void>(): DeferredPromise<T>
}
