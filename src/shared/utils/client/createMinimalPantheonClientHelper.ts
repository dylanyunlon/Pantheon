import type { Logger } from '../types'
import type { MinimalPantheonClient, MinimalPantheonClientMetadata } from './MinimalPantheonClientContext'
import { createMinimalPantheonClientFull } from './createMinimalPantheonClientFull'
import type { PipelineFactory } from '../pipeline/PipelineFactory'

export function createMinimalPantheonClientHelper(
  metadata: MinimalPantheonClientMetadata,
  baseUrl: string,
  tokenProvider: () => Promise<string>,
  options?: {
    logger?: Logger
    headers?: Record<string, string>
  },
  fetchFn?: typeof globalThis.fetch,
  pipelineFactory?: PipelineFactory<any, any>
): MinimalPantheonClient {
  return createMinimalPantheonClientFull(
    metadata,
    baseUrl,
    tokenProvider,
    options || {},
    fetchFn,
    pipelineFactory
  )
}
