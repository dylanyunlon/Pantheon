import type { Logger } from '../types'
import type { PantheonPipelineFactory } from './createPantheonClient'

declare const tag: unique symbol

export type PantheonClientCacheKey = {} & { readonly [tag]: void }

export type PantheonRequestContext = {
  finalMethodCall?: string
}

export interface MinimalPantheonClient {
  baseUrl: string
  tokenProvider: () => Promise<string>
  fetchFn: typeof globalThis.fetch
  logger?: Logger
  branch?: string
  pipelineFactory: PantheonPipelineFactory
  transactionId?: string
  flushEdits?: () => Promise<void>
  clientCacheKey: PantheonClientCacheKey
  requestContext: PantheonRequestContext
  narrowTypeMapping: Record<string, 'pipeline' | 'interface'>
}

export interface MinimalPantheonClientParams {
  metadata: MinimalPantheonClientMetadata
}

export interface MinimalPantheonClientMetadata {
  engineVersion: string
}
