import type { ScrubNormalized } from '../ScrubNormalized'
export type ScrubNormalizedFunctionParams = ScrubNormalized<Record<string, unknown>>
export class FunctionParamsScrubNormalizer { scrubNormalize(v: unknown): ScrubNormalizedFunctionParams { return v as any } }
