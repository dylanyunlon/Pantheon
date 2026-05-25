import type { PiiFieldKey } from '../PiiFieldKey'
export type FunctionPiiFieldKey = PiiFieldKey & { type: 'function' }
export const PARAMS_IDX = 0
export type FunctionCacheValue = unknown
