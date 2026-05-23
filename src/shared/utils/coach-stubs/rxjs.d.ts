declare module 'rxjs' {
  export interface Observer<T = unknown> {
    next(value: T): void
    error(err: unknown): void
    complete(): void
  }

  export class Subscription {
    unsubscribe(): void
    add(teardown: (() => void) | Subscription): void
    readonly closed: boolean
  }

  export interface Observable<T = unknown> {
    subscribe(observer: Partial<Observer<T>>): Subscription
    pipe(...operators: unknown[]): Observable<unknown>
  }

  export interface Subject<T = unknown> extends Observable<T>, Observer<T> {}

  export class ReplaySubject<T = unknown> implements Subject<T> {
    constructor(bufferSize?: number)
    next(value: T): void
    error(err: unknown): void
    complete(): void
    subscribe(observer: Partial<Observer<T>>): Subscription
    pipe(...operators: unknown[]): Observable<unknown>
  }

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
  export function combineLatest<T>(...observables: Observable<unknown>[]): Observable<unknown[]>
  export function of<T>(...values: T[]): Observable<T>
  export function scheduled<T>(input: unknown, scheduler: unknown): Observable<T>
  export function switchMap<T, R>(project: (value: T) => Observable<R>): (source: Observable<T>) => Observable<R>
  export function distinctUntilChanged<T>(compare?: (a: T, b: T) => boolean): (source: Observable<T>) => Observable<T>
  export const asapScheduler: unknown

  export type PrivacyScrub = Observable<unknown>
}
