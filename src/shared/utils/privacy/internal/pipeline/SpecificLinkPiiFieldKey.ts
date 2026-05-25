import type { PiiFieldKey } from '../PiiFieldKey'
export type SpecificLinkPiiFieldKey = PiiFieldKey & { type: 'link' }
export const LINK_INCLUDE_ALL_BASE_PROPERTIES_IDX = 4
export const SOURCE_API_NAME_IDX = 0
export const INCLUDE_ALL_BASE_PROPERTIES_IDX = LINK_INCLUDE_ALL_BASE_PROPERTIES_IDX
export const SELECT_IDX = 5
export const LINK_SELECT_IDX = SELECT_IDX
