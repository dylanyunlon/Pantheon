export type ScrubCanonical<T = unknown> = T & { __canonical?: true }
export type Canonical<T = unknown> = ScrubCanonical<T>

export type ScrubStatus = any
