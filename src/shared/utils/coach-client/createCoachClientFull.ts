import type {
  ActionDefinition,
  InterfaceMetadata,
  Logger,
  ObjectMetadata,
  ObjectSet,
  ObjectTypeDefinition,
  QueryDefinition,
  PropertyKeys,
} from '../coach-types'
import type { CoachAdvice } from '../coach-engine'
import type { GamePhase } from '../coach-scheduler'
import { applyAction } from '../coach-actions/applyAction'
import type { MinimalCoachClient } from './MinimalCoachClientContext'
import { createMinimalCoachClientFull } from './createMinimalCoachClientFull'
import { fetchCoachMetadataInternal } from './fetchCoachMetadataFull'
import { MinimalLogger } from '../coach-logger/MinimalLogger'
import { fetchPage } from '../coach-object/fetchPage'
import { fetchSingle } from '../coach-object/fetchSingle'
import { createPipeline } from '../coach-pipeline/createPipeline'
import type { PipelineFactory } from '../coach-pipeline/PipelineFactory'
import { PipelineListenerWebsocket } from '../coach-pipeline/PipelineListenerWebsocket'
import { applyQuery } from '../coach-queries/applyQuery'
import { applyStreamingQuery } from '../coach-queries/applyStreamingQuery'

export const coachClientSymbol: unique symbol = Symbol('coachClientContext')

export interface CoachClientFull {
  <Q extends ObjectTypeDefinition>(o: Q): ObjectSet

  fetchMetadata<Q extends ObjectTypeDefinition | ActionDefinition | QueryDefinition>(
    o: Q
  ): Promise<Q extends ObjectTypeDefinition ? ObjectMetadata : Q extends ActionDefinition ? ActionDefinition : never>

  readonly _ctx: MinimalCoachClient
}

class CoachActionInvoker {
  applyAction: (...args: any[]) => any
  batchApplyAction: (...args: any[]) => any

  constructor(clientCtx: MinimalCoachClient, actionDef: ActionDefinition) {
    this.applyAction = applyAction.bind(undefined, clientCtx, actionDef)
    this.batchApplyAction = applyAction.bind(undefined, clientCtx, actionDef)
  }
}

class CoachQueryInvoker {
  executeFunction: (...args: any[]) => any

  constructor(clientCtx: MinimalCoachClient, queryDef: QueryDefinition) {
    this.executeFunction = applyQuery.bind(undefined, clientCtx, queryDef)
  }
}

export function createCoachClientFullInternal(
  pipelineFactory: PipelineFactory<any, any>,
  transactionId: string | undefined,
  flushEdits: (() => Promise<void>) | undefined,
  baseUrl: string,
  gameStateId: string | Promise<string>,
  tokenProvider: () => Promise<string>,
  options:
    | {
        logger?: Logger
        headers?: Record<string, string>
      }
    | undefined = undefined,
  fetchFn: typeof globalThis.fetch = fetch
): CoachClientFull {
  if (typeof gameStateId === 'string') {
    if (!gameStateId || gameStateId.length === 0) {
      throw new Error('Invalid gameState ID: must be non-empty')
    }
  } else {
    gameStateId.then((resolved) => {
      if (!resolved || resolved.length === 0) {
        throw new Error('Invalid gameState ID: resolved to empty string')
      }
    })
  }

  const clientCtx: MinimalCoachClient = createMinimalCoachClientFull(
    { gameStateId },
    baseUrl,
    tokenProvider,
    {
      ...options,
      logger: options?.logger ?? new MinimalLogger(),
      transactionId,
      flushEdits,
    },
    fetchFn,
    pipelineFactory
  )

  return createCoachClientFromCtx(clientCtx)
}

export function createCoachClientFromCtx(clientCtx: MinimalCoachClient): CoachClientFull {
  function clientFn<
    T extends ObjectTypeDefinition | ActionDefinition | QueryDefinition
  >(
    o: T
  ): T extends ObjectTypeDefinition
    ? ObjectSet
    : T extends ActionDefinition
      ? CoachActionInvoker
      : T extends QueryDefinition
        ? CoachQueryInvoker
        : never {
    if ((o as any).type === 'object' || (o as any).type === 'interface') {
      return clientCtx.pipelineFactory(o as any, clientCtx) as any
    } else if ((o as any).type === 'action') {
      return new CoachActionInvoker(clientCtx, o as any) as any
    } else if ((o as any).type === 'query') {
      return new CoachQueryInvoker(clientCtx, o as any) as any
    }
    throw new Error('Unsupported definition type')
  }

  const fetchMetadata = fetchCoachMetadataInternal.bind(undefined, clientCtx)

  const client: CoachClientFull = Object.defineProperties(
    clientFn as unknown as CoachClientFull,
    {
      [coachClientSymbol]: { value: clientCtx },
      _ctx: { value: clientCtx },
      fetchMetadata: { value: fetchMetadata }
    }
  )

  return client
}

export function createCoachClientFullExport(
  baseUrl: string,
  gameStateId: string | Promise<string>,
  tokenProvider: () => Promise<string>,
  options?: {
    logger?: Logger
    headers?: Record<string, string>
  },
  fetchFn?: typeof fetch
): CoachClientFull {
  return createCoachClientFullInternal(
    createPipeline as unknown as PipelineFactory<any, any>,
    undefined,
    undefined,
    baseUrl,
    gameStateId,
    tokenProvider,
    options,
    fetchFn
  )
}

export function createCoachClientFullWithTransaction(
  transactionId: string,
  flushEdits: () => Promise<void>,
  ...args: Parameters<typeof createCoachClientFullExport>
): CoachClientFull {
  return createCoachClientFullInternal(
    createPipeline as unknown as PipelineFactory<any, any>,
    transactionId,
    flushEdits,
    ...args
  )
}

function createWithGameId(gameIds: string[]): ObjectSet {
  return {
    type: 'base',
    objectType: 'game-instance',
    where: { gameId: { $in: gameIds } }
  }
}
