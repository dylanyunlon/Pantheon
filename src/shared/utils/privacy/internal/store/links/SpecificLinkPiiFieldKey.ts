import type { PiiFieldKey } from "../../../../types"
export type SpecificLinkPiiFieldKey = PiiFieldKey & { type: "link" }
export const SOURCE_API_NAME_IDX = 0
export const LINK_NAME_IDX = 1
export const WHERE_IDX = 2
export const ORDER_BY_IDX = 3
export const INCLUDE_ALL_BASE_PROPERTIES_IDX = 4
export const SELECT_IDX = 5
