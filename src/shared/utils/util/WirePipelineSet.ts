export function isWireObjectSet(_v: unknown): _v is Record<string, unknown> { return typeof _v === "object" && _v !== null && "type" in _v }
export function isWirePipelineSet(_v: unknown): _v is Record<string, unknown> { return isWireObjectSet(_v) }
