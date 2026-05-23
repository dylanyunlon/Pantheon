export function getWireObjectSet(os: unknown): unknown { return os }
export function isObjectSet(v: unknown): boolean { return typeof v === 'object' && v !== null && 'type' in v }
export function createObjectSet(type: string, clientCtx: unknown, objectSet?: unknown): unknown {
  return objectSet ?? { type: 'base', objectType: type }
}
export function isPipelineSet(v: unknown): boolean { return typeof v === 'object' && v !== null && 'type' in v }
