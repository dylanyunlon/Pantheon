import type { Logger } from '../coach-types'
import type {
  CoachClientCacheKey,
  MinimalCoachClient,
  MinimalCoachClientParams
} from './MinimalCoachContext'
import type { CoachPipelineFactory } from './createCoachClient'
import { USER_AGENT_HEADER } from '../coach-types'

export function createMinimalCoachClient(
  metadata: MinimalCoachClientParams['metadata'],
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
  pipelineFactory?: CoachPipelineFactory
): MinimalCoachClient {
  const minimalClient: MinimalCoachClient = {
    baseUrl,
    tokenProvider,
    fetchFn,
    logger: options.logger,
    transactionId: options.transactionId,
    flushEdits: options.flushEdits,
    branch: options.branch,
    pipelineFactory: pipelineFactory || defaultPipelineFactory,
    clientCacheKey: {} as CoachClientCacheKey,
    requestContext: {},
    narrowTypeMapping: {}
  }

  return Object.freeze(minimalClient)
}

function defaultPipelineFactory(_type: string, _client: MinimalCoachClient): unknown {
  return { type: 'base', objectType: _type }
}
