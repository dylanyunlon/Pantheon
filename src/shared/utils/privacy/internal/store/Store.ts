import type { Logger } from "../../../types"

export namespace Store {
  export interface ApplyActionOptions {
    optimisticUpdate?: (ctx: unknown) => void
    mode?: string
  }
}

export class Store {
  readonly whereScrubNormalizer: any
  readonly orderByScrubNormalizer: any
  readonly rdpScrubNormalizer: any
  readonly intersectScrubNormalizer: any
  readonly pivotScrubNormalizer: any
  readonly ridListScrubNormalizer: any
  readonly selectScrubNormalizer: any
  readonly objectSetArrayScrubNormalizer: any
  readonly genericScrubNormalizer: any
  readonly client: any
  readonly logger?: Logger
  readonly piiFieldKeys: any
  readonly queries: any
  readonly layers: any
  readonly objects: any
  readonly scrubFields: any
  readonly functions: any
  readonly aggregations: any
  readonly links: any
  readonly media: any
  readonly pipelineSets: any
  readonly actions: any
  readonly objectPiiFieldKeyRegistry: any
  
  constructor(..._args: unknown[]) {}
  
  read(_key: unknown): { value: any; status: string } | undefined { return undefined }
  write(_key: unknown, _data: unknown, _status: string): void {}
  delete(_key: unknown, _status: string): void {}
  batch(_fn: (ctx: any) => void): void {}
  invalidateAll(): Promise<void> { return Promise.resolve() }
  invalidateObjects(..._args: unknown[]): Promise<void> { return Promise.resolve() }
  invalidatePiiFieldType(..._args: unknown[]): Promise<void> { return Promise.resolve() }
  
  [key: string]: any
}
