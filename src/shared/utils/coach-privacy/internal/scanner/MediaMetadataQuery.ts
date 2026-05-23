export type MediaMetadataQueryOptions = { includeMetadata?: boolean }
export class MediaMetadataQuery { protected store: any; protected piiFieldKey: any; protected logger: any; revalidate(_force: boolean): Promise<void> { return Promise.resolve() }; protected setStatus(_s: string, _batch: unknown): void {}; dispose(): void {} }
