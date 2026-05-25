export class BaseScrubFieldQuery<_K = unknown, _P = unknown, _O = unknown> {
  constructor(..._args: unknown[]) {}
  protected store: any
  protected piiFieldKey: any
  protected piiFieldKeys: any
  protected logger: any
  protected nextPageToken?: string
  protected options: any
  protected sortingStrategy: any
  protected abortController?: AbortController
  protected pendingPageFetch?: Promise<void>
  protected pendingFetch?: Promise<void>
  protected currentTotalCount?: string
  protected minResultsToLoad?: number
  apiName!: string
  scrubNormalizedWhere: unknown
  revalidate(_force: boolean): Promise<void> { return Promise.resolve() }
  protected writeToStore(..._args: unknown[]): any {}
  protected createWebsocketSubscription(..._args: unknown[]): void {}
  protected setStatus(_s: string, _batch: unknown): void {}
  protected fetchPageAndUpdate(..._args: unknown[]): Promise<void> { return Promise.resolve() }
  protected getEffectiveFetchPageSize(): number { return 100 }
  get rdpConfig(): unknown { return undefined }
  get includeAllBaseObjectProperties(): boolean { return false }
  protected _updateScrubField(..._args: unknown[]): void {}
  protected fetchMore: any
  protected getObjectPiiFieldKey(_obj: unknown): unknown { return undefined }
  protected _preFetch(): void {}
  createPayload(_params: unknown): Record<string, unknown> { return {} }
}
