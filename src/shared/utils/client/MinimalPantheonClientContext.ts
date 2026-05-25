import type { Logger } from '../types'
import type { PipelineFactory } from '../pipeline/PipelineFactory'
import type { GameStateProvider } from '../gameState/GameStateProvider'

declare const tag: unique symbol

export type PantheonCacheKey = {} & { readonly [tag]: void }

export type PantheonRequestContext = {
  finalMethodCall?: string
}

export interface MinimalPantheonClient {
  baseUrl: string
  tokenProvider: () => Promise<string>
  fetchFn: typeof globalThis.fetch
  fetch?: typeof globalThis.fetch
  gameStateId: string | Promise<string>
  gameStateRid: string | Promise<string>
  gameStateProvider: GameStateProvider
  logger?: Logger
  branch?: string
  pipelineFactory: PipelineFactory<any, any>
  objectSetFactory: (...args: any[]) => any
  objectFactory: (...args: any[]) => any
  transactionId?: string
  flushEdits?: () => Promise<void>
  clientCacheKey: PantheonCacheKey
  requestContext: PantheonRequestContext
  narrowTypeMapping: Record<string, 'pipeline' | 'interface'>
  narrowTypeInterfaceOrObjectMapping: Record<string, 'object' | 'interface'>
}

export interface MinimalPantheonClientParams {
  metadata: MinimalPantheonClientMetadata
  provider: GameStateProvider
}

export interface MinimalPantheonClientMetadata {
  gameStateId: string | Promise<string>
}
