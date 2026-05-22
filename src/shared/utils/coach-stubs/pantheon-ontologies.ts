export type DataValue = string | number | boolean | null | DataValue[] | { [key: string]: DataValue }
export type AggregateObjectsResponseV2 = { data: Array<{ group: Record<string, unknown>; metrics: Record<string, number> }> }
export type AggregationV2 = { field: string; operation: string }
export type DatetimeLocalizedFormatType = 'short' | 'medium' | 'long' | 'full'
export type DerivedPropertyDefinition = { apiName: string; expression: string; resultType: string; objectTypes: string[] }
export type ObjectSet = { type: string; objectType?: string; where?: unknown; objectSets?: ObjectSet[] }
export type TimeRange = { startTime: string; endTime: string }
export type GameStateObjectV2 = { __apiName: string; __primaryKey: string; [key: string]: unknown }
export const Action = { applyAction: async (..._args: unknown[]) => ({}) }
export const Query = { execute: async (..._args: unknown[]) => ({}) }
export const GameStateObjectSet = { create: (..._args: unknown[]) => ({} as ObjectSet) }
export const Attachment = { upload: async (..._args: unknown[]) => ({}) }
