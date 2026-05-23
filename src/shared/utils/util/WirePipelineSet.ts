export function isWirePipelineSet(v: unknown): boolean { return typeof v === 'object' && v !== null && 'type' in v }
