export const PIVOT_IDX = 0
export const RDP_IDX = 1
export const RIDS_IDX = 2
export const INTERSECT_IDX = 3
export const INCLUDE_ALL_BASE_PROPERTIES_IDX = 4
export type ScrubFieldQuery = { piiFieldKey: any; store: any; apiName: string; scrubNormalizedWhere: unknown; logger: any; sortingStrategy: any; nextPageToken?: string; options: any; revalidate(force: boolean): Promise<void>; getEffectiveFetchPageSize(): number; writeToStore(...args: unknown[]): any; createWebsocketSubscription(...args: unknown[]): void; _updateScrubField(...args: unknown[]): void; piiFieldKeys: any; fetchMore: any; get rdpConfig(): unknown; get includeAllBaseObjectProperties(): boolean }
