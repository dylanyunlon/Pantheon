export class Query<_K = unknown, _P = unknown, _O = unknown> {
  constructor(..._args: unknown[]) {}
  protected store: any
  protected piiFieldKey: any
  protected piiFieldKeys: any
  protected logger: any
  protected options: any
  protected sortingStrategy: any
  protected nextPageToken?: string
  protected pendingFetch?: Promise<void>
  protected abortController?: AbortController
  protected currentTotalCount?: string
  apiName!: string
  scrubNormalizedWhere: unknown
  revalidate(_force: boolean): Promise<void> { return Promise.resolve() }
  protected writeToStore(..._args: unknown[]): any {}
  protected createWebsocketSubscription(..._args: unknown[]): void {}
  protected setStatus(_s: string, _batch: unknown): void {}
  protected fetchPageAndUpdate(..._args: unknown[]): Promise<void> { return Promise.resolve() }
  protected getEffectiveFetchPageSize(): number { return 100 }
  protected _updateScrubField(..._args: unknown[]): void {}
  protected getObjectPiiFieldKey(_obj: unknown): unknown { return undefined }
  protected fetchMore: any
  get rdpConfig(): unknown { return undefined }
  get includeAllBaseObjectProperties(): boolean { return false }
  dependsOnObject(..._args: unknown[]): boolean { return false }
  ensureInvalidationTypesReady(): Promise<void> { return Promise.resolve() }
}
