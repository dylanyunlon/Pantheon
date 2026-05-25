export type PartialByNotStrict<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

export type PartialBy = any
