declare module 'rxjs' {
  export interface Observer<T = unknown> {
    next(value: T): void
    error(err: unknown): void
    complete(): void
  }

  export interface Subscription {
    unsubscribe(): void
    readonly closed: boolean
  }

  export interface Observable<T = unknown> {
    subscribe(observer: Partial<Observer<T>>): Subscription
    pipe(...operators: unknown[]): Observable<unknown>
  }

  export interface Subject<T = unknown> extends Observable<T>, Observer<T> {}

  export interface Connectable<T = unknown> extends Observable<T> {
    connect(): Subscription
  }

  export class BehaviorSubject<T = unknown> implements Subject<T> {
    constructor(initialValue: T)
    getValue(): T
    get value(): T
    next(value: T): void
    error(err: unknown): void
    complete(): void
    subscribe(observer: Partial<Observer<T>>): Subscription
    pipe(...operators: unknown[]): Observable<unknown>
  }

  export function connectable<T>(source: Observable<T>, config?: unknown): Connectable<T>
  export function map<T, R>(project: (value: T) => R): (source: Observable<T>) => Observable<R>

  export type PrivacyScrub = Observable<unknown>
}
