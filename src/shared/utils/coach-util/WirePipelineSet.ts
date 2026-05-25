export function isWireObjectSet(_v: unknown): boolean { return typeof _v === "object" && _v !== null && "type" in _v }
export function isWirePipelineSet(_v: unknown): boolean { return isWireObjectSet(_v) }
