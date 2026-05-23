export function isObjectInstance(v: unknown): boolean { return typeof v === 'object' && v !== null && '$objectType' in v }
