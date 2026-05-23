import type { ScrubNormalized } from './ScrubNormalized'
export type Rdp = Record<string, unknown>
export class RdpScrubNormalizer { scrubNormalize(v: unknown): ScrubNormalized<Rdp> | undefined { return v as any } }
