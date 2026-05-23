import type { ScrubNormalized } from './ScrubNormalized'
export type OrderByScrubNormalizer = { scrubNormalize(v: unknown): ScrubNormalized<unknown> }
