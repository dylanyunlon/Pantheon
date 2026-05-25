import type { Logger } from '../types'
import type {
  PantheonClientCacheKey,
  MinimalPantheonClient,
  MinimalPantheonClientParams
} from './MinimalPantheonContext'
import type { PantheonPipelineFactory } from './createPantheonClient'
import { USER_AGENT_HEADER } from '../types'

export function createMinimalPantheonClient(
  metadata: MinimalPantheonClientParams['metadata'],
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
  pipelineFactory?: PantheonPipelineFactory
): MinimalPantheonClient {
  const minimalClient: MinimalPantheonClient = {
    baseUrl,
    tokenProvider,
    fetchFn,
    logger: options.logger,
    transactionId: options.transactionId,
    flushEdits: options.flushEdits,
    branch: options.branch,
    pipelineFactory: pipelineFactory || defaultPipelineFactory,
    clientCacheKey: {} as PantheonClientCacheKey,
    requestContext: {},
    narrowTypeMapping: {}
  }

  return Object.freeze(minimalClient)
}

function defaultPipelineFactory(_type: string, _client: MinimalPantheonClient): unknown {
  return { type: 'base', objectType: _type }
}
