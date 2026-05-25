export type { Observer, Status, CommonObserveOptions, OrderBy } from '../../privacy/PrivacyScrubClient/common'
export type ObserveScrubFieldOptions = { pageSize?: number }
export type ObserveObjectOptions<_T = any> = { select?: string[] }
export type ObserveObjectSetOptions<_T = any, _RDPs = any> = { pageSize?: number }
export type CacheEntry = { value: unknown; status: string }
export type CacheSnapshot = { entries: Array<CacheEntry> }
