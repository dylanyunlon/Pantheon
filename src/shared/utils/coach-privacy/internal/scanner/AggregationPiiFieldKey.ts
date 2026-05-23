import type { PiiFieldKey } from '../PiiFieldKey'
export type AggregationPiiFieldKey = PiiFieldKey & { type: 'aggregation' }
export const API_NAME_IDX = 0
export const RDP_IDX = 1
export const INTERSECT_IDX = 2
