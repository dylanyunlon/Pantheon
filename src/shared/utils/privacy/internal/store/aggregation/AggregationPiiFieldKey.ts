import type { PiiFieldKey } from "../../../../types"
export type AggregationPiiFieldKey = PiiFieldKey & { type: "aggregation" }
export const API_NAME_IDX = 0
export const RDP_IDX = 1
export const INTERSECT_IDX = 2
export const AGGREGATE_IDX = 3
export const WHERE_IDX = 4
export const WIRE_OBJECT_SET_IDX = 5
