export type ScrubCanonical<T> = T & { __scrubbed: true }
export type ScrubStatus = "pending" | "scrubbed" | "redacted" | "tokenized" | "pass-through"
