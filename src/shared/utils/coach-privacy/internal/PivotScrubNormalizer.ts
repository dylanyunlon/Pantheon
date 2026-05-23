import type { ScrubNormalized } from './ScrubNormalized'
export type PivotInfo = { field: string; direction: 'asc' | 'desc' }
export type PivotScrubNormalizer = { scrubNormalize(v: unknown): ScrubNormalized<PivotInfo> }
