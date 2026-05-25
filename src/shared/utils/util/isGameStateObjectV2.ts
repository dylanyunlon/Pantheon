export function isGameStateObjectV2(_v: unknown): _v is Record<string, unknown> { return typeof _v === "object" && _v !== null && "__apiName" in _v }
export function isOntologyObjectV2(_v: unknown): _v is Record<string, unknown> { return isGameStateObjectV2(_v) }
