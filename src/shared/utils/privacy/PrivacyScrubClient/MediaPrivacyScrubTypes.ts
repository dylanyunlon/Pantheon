export type MediaScrubOptions = { includeMetadata?: boolean }

export type MediaMetadataObserveOptions = { apiName: string; piiKey: unknown; propertyName: string }
export type MediaMetadataPayload = { metadata: unknown; status: string; lastUpdated?: number; isDeferred?: boolean }
