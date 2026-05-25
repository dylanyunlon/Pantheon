import type { PiiFieldKey } from '../PiiFieldKey'
export type ScrubFieldPiiFieldKey = PiiFieldKey & { type: 'scrubField' }
export const RDP_IDX = 1
export const INCLUDE_ALL_BASE_PROPERTIES_IDX = 4
export const API_NAME_IDX = 0
export const WHERE_IDX = 2
export const ORDER_BY_IDX = 3
export const SELECT_IDX = 5
export const INTERSECT_IDX = 6
export const PIVOT_IDX = 7
export const RIDS_IDX = 8
