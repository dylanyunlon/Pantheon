import type { ScrubNormalized } from './ScrubNormalized'
export type ObjectSetArrayScrubNormalizer = { scrubNormalize(v: unknown): ScrubNormalized<unknown[]> }
