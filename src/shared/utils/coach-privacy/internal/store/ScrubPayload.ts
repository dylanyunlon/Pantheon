export type ScrubPayload = { data: unknown; scrubbed: boolean }
export function createScrubPayload(data: unknown): ScrubPayload { return { data, scrubbed: false } }
