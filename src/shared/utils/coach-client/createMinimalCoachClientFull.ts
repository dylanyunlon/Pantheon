import type { Logger } from '../coach-types'
import type {
  CoachCacheKey,
  MinimalCoachClient,
  MinimalCoachClientParams
} from './MinimalCoachClientContext'
import type { PipelineFactory } from '../coach-pipeline/PipelineFactory'
import type { GameStateProvider } from '../coach-gamestate/GameStateProvider'
import {
  createStandardGameStateProviderFactory,
} from '../coach-gamestate/StandardGameStateProvider'
import { USER_AGENT_HEADER } from '../coach-types'
import { createPipeline } from '../coach-pipeline/createPipeline'

export function createMinimalCoachClientFull(
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
  pipelineFactory?: PipelineFactory,
  createGameStateProviderFactory: (
    opts: { logger?: Logger }
  ) => (client: MinimalCoachClient) => GameStateProvider = createStandardGameStateProviderFactory
): MinimalCoachClient {
  const minimalClient: MinimalCoachClient = {
    baseUrl,
    tokenProvider,
    fetchFn,
    gameStateId: metadata.gameStateId,
    pipelineFactory: (pipelineFactory || createPipeline) as unknown as PipelineFactory,
    logger: options.logger,
    transactionId: options.transactionId,
    flushEdits: options.flushEdits,
    branch: options.branch,
    clientCacheKey: {} as CoachCacheKey,
    requestContext: {},
    narrowTypeMapping: {},
    gameStateProvider: undefined as any
  }

  const provider = createGameStateProviderFactory({ logger: options.logger })(minimalClient)
  ;(minimalClient as any).gameStateProvider = provider

  return Object.freeze(minimalClient) as MinimalCoachClient
}
