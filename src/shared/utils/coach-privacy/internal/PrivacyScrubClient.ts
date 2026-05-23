export type { Observer, Status, CommonObserveOptions, OrderBy } from '../../coach-privacy/PrivacyScrubClient/common'
export type ObserveScrubFieldOptions = { pageSize?: number }
export type ObserveObjectOptions = { select?: string[] }
export type ObserveObjectSetOptions = { pageSize?: number }
export type CacheEntry = { value: unknown; status: string }
export type CacheSnapshot = Map<unknown, CacheEntry>
