export type Observer<T = unknown> = { next(v: T): void; error(e: unknown): void; complete(): void }
export type Status = 'loading' | 'loaded' | 'error'
export type CommonObserveOptions = { pageSize?: number }
export type OrderBy = { field: string; direction: 'asc' | 'desc' }
