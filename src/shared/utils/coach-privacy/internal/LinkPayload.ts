export type LinkPayload = { data: unknown[]; status: string; totalCount?: number; fetchMore?: () => Promise<void>; hasMore?: boolean; resolvedScrubField?: unknown[]; isDeferred?: boolean; lastUpdated?: number; linkedObjectsBySourcePrimaryKey?: unknown }
export type SpecificLinkPayload = LinkPayload
