export type MediaMetadataQueryOptions = { includeMetadata?: boolean; apiName?: string; piiKey?: unknown; preview?: boolean }
export type MediaMetadataObserveOptions = MediaMetadataQueryOptions
export type MediaMetadataPayload = { metadata?: unknown; status: string; lastUpdated?: number; isDeferred?: boolean }
export class MediaMetadataQuery {
  protected store: any
  protected piiFieldKey: any
  protected logger: any
  revalidate(_force: boolean): Promise<void> { return Promise.resolve() }
  protected setStatus(_s: string, _batch: unknown): void {}
  dispose(): void {}
}
