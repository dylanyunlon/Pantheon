import type { Logger } from '../coach-types'
import type { PipelineFactory } from '../coach-pipeline/PipelineFactory'
import type { GameStateProvider } from '../coach-gamestate/GameStateProvider'

declare const tag: unique symbol

export type CoachCacheKey = {} & { readonly [tag]: void }

export type CoachRequestContext = {
  finalMethodCall?: string
}

export interface MinimalCoachClient {
  baseUrl: string
  tokenProvider: () => Promise<string>
  fetchFn: typeof globalThis.fetch
  gameStateId: string | Promise<string>
  gameStateProvider: GameStateProvider
  logger?: Logger
  branch?: string
  pipelineFactory: PipelineFactory
  transactionId?: string
  flushEdits?: () => Promise<void>
  clientCacheKey: CoachCacheKey
  requestContext: CoachRequestContext
  narrowTypeMapping: Record<string, 'pipeline' | 'interface'>
}

export interface MinimalCoachClientParams {
  metadata: MinimalCoachClientMetadata
  provider: GameStateProvider
}

export interface MinimalCoachClientMetadata {
  gameStateId: string | Promise<string>
}
