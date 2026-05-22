export const piiTombstone: unique symbol = Symbol.for(
  "coach-privacy:scrubbed-tombstone",
)
export type PiiTombstone = typeof piiTombstone
