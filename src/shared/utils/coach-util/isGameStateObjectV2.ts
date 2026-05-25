export function isGameStateObjectV2(_v: unknown): boolean { return typeof _v === "object" && _v !== null && "__apiName" in _v }
export function isOntologyObjectV2(_v: unknown): boolean { return isGameStateObjectV2(_v) }
