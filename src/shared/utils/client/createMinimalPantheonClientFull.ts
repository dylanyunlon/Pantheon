import type { Logger } from '../types'
import type {
  PantheonCacheKey,
  MinimalPantheonClient,
  MinimalPantheonClientParams
} from './MinimalPantheonClientContext'
import type { PipelineFactory } from '../pipeline/PipelineFactory'
import type { GameStateProvider } from '../gamestate/GameStateProvider'
import {
  createStandardGameStateProviderFactory,
} from '../gamestate/StandardGameStateProvider'
import { USER_AGENT_HEADER } from '../types'
import { createPipeline } from '../pipeline/createPipeline'

export function createMinimalPantheonClientFull(
  metadata: { gameStateId: string | Promise<string> },
  baseUrl: string,
  tokenProvider: () => Promise<string>,
  options: {
    logger?: Logger
    transactionId?: string
    flushEdits?: () => Promise<void>
    branch?: string
    headers?: Record<string, string>
  } = {},
  fetchFn: (
    input: Request | URL | string,
    init?: RequestInit | undefined
  ) => Promise<Response> = globalThis.fetch,
  pipelineFactory?: PipelineFactory<any, any>,
  createGameStateProviderFactory: (
    opts: { logger?: Logger }
  ) => (client: MinimalPantheonClient) => GameStateProvider = createStandardGameStateProviderFactory
): MinimalPantheonClient {
  const minimalClient: MinimalPantheonClient = {
    baseUrl,
    tokenProvider,
    fetchFn,
    gameStateId: metadata.gameStateId,
    pipelineFactory: (pipelineFactory || createPipeline) as unknown as PipelineFactory<any, any>,
    logger: options.logger,
    transactionId: options.transactionId,
    flushEdits: options.flushEdits,
    branch: options.branch,
    clientCacheKey: {} as PantheonCacheKey,
    requestContext: {},
    narrowTypeMapping: {},
    narrowTypeInterfaceOrObjectMapping: {},
    objectSetFactory: (...args: any[]) => args,
    objectFactory: (...args: any[]) => args,
    gameStateRid: metadata.gameStateId,
    gameStateProvider: undefined as any
  }

  const provider = createGameStateProviderFactory({ logger: options.logger })(minimalClient)
  ;(minimalClient as any).gameStateProvider = provider

  return Object.freeze(minimalClient) as MinimalPantheonClient
}
