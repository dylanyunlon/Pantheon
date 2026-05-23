import type { ScrubNormalized } from './ScrubNormalized'
export type WhereClauseScrubNormalizer = { scrubNormalize(v: unknown): ScrubNormalized<unknown> }
