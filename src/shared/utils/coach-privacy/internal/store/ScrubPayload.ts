export type ScrubPayload = { value: unknown; status: string; lastUpdated?: number; isDeferred?: boolean }
export function createScrubPayload(): ScrubPayload { return { value: undefined, status: "init" } }
