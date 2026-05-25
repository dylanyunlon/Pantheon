export const piiTombstone = Symbol("piiTombstone")
export type PiiTombstone = typeof piiTombstone
export function isPiiTombstone(v: unknown): v is PiiTombstone { return v === piiTombstone }
