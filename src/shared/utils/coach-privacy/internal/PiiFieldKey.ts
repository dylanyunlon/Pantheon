export type PiiFieldKey = { key: string; otherKeys: unknown[] }
export function DEBUG_ONLY__piiFieldKeyToString(k: PiiFieldKey): string { return k.key }
export function DEBUG_ONLY__piiFieldKeysToString(keys: Iterable<PiiFieldKey>): string { return Array.from(keys).map(DEBUG_ONLY__piiFieldKeyToString).join(', ') }
