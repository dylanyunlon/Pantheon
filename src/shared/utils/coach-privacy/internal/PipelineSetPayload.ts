export type PipelineSetPayload = { data: unknown[]; totalCount?: number; status: string; fetchMore?: () => Promise<void>; hasMore?: boolean; resolvedScrubField?: unknown[]; isDeferred?: boolean; lastUpdated?: number; pipelineSet?: unknown }
export type ObjectSetPayload = PipelineSetPayload
