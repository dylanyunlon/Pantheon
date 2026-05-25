export type ScrubOperationId = string & { __scrubOpId: true }

let _opCounter = 0

export function generateScrubOperationId(): ScrubOperationId {
  _opCounter++
  const ts = Date.now().toString(36)
  const seq = _opCounter.toString(36).padStart(4, "0")
  return `scrub-${ts}-${seq}` as ScrubOperationId
}

export function isScrubOperationId(value: unknown): value is ScrubOperationId {
  return typeof value === "string" && value.startsWith("scrub-")
}
