export function getWireObjectSet(os: unknown): unknown { return os }
export function isObjectSet(v: unknown): boolean { return typeof v === 'object' && v !== null && 'type' in v }
