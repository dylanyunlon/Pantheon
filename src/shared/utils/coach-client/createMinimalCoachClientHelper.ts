import type { Logger } from '../coach-types'
import type { MinimalCoachClient, MinimalCoachClientMetadata } from './MinimalCoachClientContext'
import { createMinimalCoachClientFull } from './createMinimalCoachClientFull'
import type { PipelineFactory } from '../coach-pipeline/PipelineFactory'

export function createMinimalCoachClientHelper(
  metadata: MinimalCoachClientMetadata,
  baseUrl: string,
  tokenProvider: () => Promise<string>,
  options?: {
    logger?: Logger
    headers?: Record<string, string>
  },
  fetchFn?: typeof globalThis.fetch,
  pipelineFactory?: PipelineFactory
): MinimalCoachClient {
  return createMinimalCoachClientFull(
    metadata,
    baseUrl,
    tokenProvider,
    options || {},
    fetchFn,
    pipelineFactory
  )
}
