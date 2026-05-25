export type LinkPayload = { data: unknown[]; status: string; totalCount?: number; fetchMore?: () => Promise<void>; hasMore?: boolean; lastUpdated?: number; linkedObjectsBySourcePrimaryKey?: unknown; isOptimistic?: boolean }
export type SpecificLinkPayload = LinkPayload
export type ObjectSetPayload = LinkPayload
