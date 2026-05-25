import type { PiiFieldKey } from "../../../types"
export type ObjectPiiFieldKey = PiiFieldKey & { type: "object" }
export const OBJECT_TYPE_IDX = 0
export const PK_IDX = 1
export const RDP_CONFIG_IDX = 2
