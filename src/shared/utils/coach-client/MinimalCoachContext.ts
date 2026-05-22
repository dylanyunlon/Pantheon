import type { Logger } from '../coach-types'
import type { CoachPipelineFactory } from './createCoachClient'

declare const tag: unique symbol

export type CoachClientCacheKey = {} & { readonly [tag]: void }

export type CoachRequestContext = {
  finalMethodCall?: string
}

export interface MinimalCoachClient {
  baseUrl: string
  tokenProvider: () => Promise<string>
  fetchFn: typeof globalThis.fetch
  logger?: Logger
  branch?: string
  pipelineFactory: CoachPipelineFactory
  transactionId?: string
  flushEdits?: () => Promise<void>
  clientCacheKey: CoachClientCacheKey
  requestContext: CoachRequestContext
  narrowTypeMapping: Record<string, 'pipeline' | 'interface'>
}

export interface MinimalCoachClientParams {
  metadata: MinimalCoachClientMetadata
}

export interface MinimalCoachClientMetadata {
  engineVersion: string
}
