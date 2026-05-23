import type { ScrubNormalized } from './ScrubNormalized'
export type SelectScrubNormalizer = { scrubNormalize(v: unknown): ScrubNormalized<unknown> }
