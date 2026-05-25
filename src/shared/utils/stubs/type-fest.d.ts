declare module 'type-fest' {
  export type Observer<T = unknown> = {
    next(value: T): void
    error(err: unknown): void
    complete(): void
  }
  export type PartialDeep<T> = T extends object ? { [P in keyof T]?: PartialDeep<T[P]> } : T
  export type RequiredDeep<T> = T extends object ? { [P in keyof T]-?: RequiredDeep<T[P]> } : T
  export type SetRequired<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>
}
