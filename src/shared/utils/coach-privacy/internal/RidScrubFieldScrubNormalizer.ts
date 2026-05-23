import type { ScrubNormalized } from './ScrubNormalized'
export type RidScrubFieldScrubNormalizer = { scrubNormalize(v: unknown): ScrubNormalized<string[]> }
