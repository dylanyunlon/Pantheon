import type { ScrubNormalized } from './ScrubNormalized'
export type IntersectScrubNormalizer = { scrubNormalize(v: unknown): ScrubNormalized<unknown> }
