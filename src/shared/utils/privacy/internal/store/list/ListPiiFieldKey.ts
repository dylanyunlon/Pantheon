import type { PiiFieldKey } from "../../../../types"
export type ListPiiFieldKey = PiiFieldKey & { type: "list" }
export const API_NAME_IDX = 0
export const WHERE_IDX = 1
export const ORDER_BY_IDX = 2
export const SELECT_IDX = 3
export const RDP_IDX = 4
export const INTERSECT_IDX = 5
export const PIVOT_IDX = 6
export const RIDS_IDX = 7
export const INCLUDE_ALL_BASE_PROPERTIES_IDX = 8

export type RDP_IDX = any
