export class FunctionParamsScrubNormalizer {
  constructor(..._args: unknown[]) {}
  scrubNormalize(_v: unknown): unknown { return _v }
  scrubNormalizeParams(_v: unknown): unknown { return _v }
}

export type ScrubNormalizedFunctionParams = any
