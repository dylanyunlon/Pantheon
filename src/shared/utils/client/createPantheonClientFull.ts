import type {
  ActionDefinition,
  InterfaceMetadata,
  Logger,
  ObjectMetadata,
  ObjectSet,
  ObjectTypeDefinition,
  QueryDefinition,
  PropertyKeys,
} from '../types'
import type { PantheonAdvice } from '../engine'
import type { GamePhase } from '../scheduler'
import { applyAction } from '../actions/applyAction'
import type { MinimalPantheonClient } from './MinimalPantheonClientContext'
import { createMinimalPantheonClientFull } from './createMinimalPantheonClientFull'
import { fetchPantheonMetadataInternal } from './fetchPantheonMetadataFull'
import { MinimalLogger } from '../logger/MinimalLogger'
import { fetchPage } from '../object/fetchPage'
import { fetchSingle } from '../object/fetchSingle'
import { createPipeline } from '../pipeline/createPipeline'
import type { PipelineFactory } from '../pipeline/PipelineFactory'
import { PipelineListenerWebsocket } from '../pipeline/PipelineListenerWebsocket'
import { applyQuery } from '../queries/applyQuery'
import { applyStreamingQuery } from '../queries/applyStreamingQuery'

export const coachClientSymbol: unique symbol = Symbol('clientContext')

export interface PantheonClientFull {
  <Q extends ObjectTypeDefinition>(o: Q): ObjectSet

  fetchMetadata<Q extends ObjectTypeDefinition | ActionDefinition | QueryDefinition>(
    o: Q
  ): Promise<Q extends ObjectTypeDefinition ? ObjectMetadata : Q extends ActionDefinition ? ActionDefinition : never>

  readonly _ctx: MinimalPantheonClient
}

class PantheonActionInvoker {
  applyAction: (...args: any[]) => any
  batchApplyAction: (...args: any[]) => any

  constructor(clientCtx: MinimalPantheonClient, actionDef: ActionDefinition) {
    this.applyAction = applyAction.bind(undefined, clientCtx, actionDef)
    this.batchApplyAction = applyAction.bind(undefined, clientCtx, actionDef)
  }
}

class PantheonQueryInvoker {
  executeFunction: (...args: any[]) => any

  constructor(clientCtx: MinimalPantheonClient, queryDef: QueryDefinition) {
    this.executeFunction = applyQuery.bind(undefined, clientCtx, queryDef)
  }
}

export function createPantheonClientFullInternal(
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
): PantheonClientFull {
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

  const clientCtx: MinimalPantheonClient = createMinimalPantheonClientFull(
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

  return createPantheonClientFromCtx(clientCtx)
}

export function createPantheonClientFromCtx(clientCtx: MinimalPantheonClient): PantheonClientFull {
  function clientFn<
    T extends ObjectTypeDefinition | ActionDefinition | QueryDefinition
  >(
    o: T
  ): T extends ObjectTypeDefinition
    ? ObjectSet
    : T extends ActionDefinition
      ? PantheonActionInvoker
      : T extends QueryDefinition
        ? PantheonQueryInvoker
        : never {
    if ((o as any).type === 'object' || (o as any).type === 'interface') {
      return clientCtx.pipelineFactory(o as any, clientCtx) as any
    } else if ((o as any).type === 'action') {
      return new PantheonActionInvoker(clientCtx, o as any) as any
    } else if ((o as any).type === 'query') {
      return new PantheonQueryInvoker(clientCtx, o as any) as any
    }
    throw new Error('Unsupported definition type')
  }

  const fetchMetadata = fetchPantheonMetadataInternal.bind(undefined, clientCtx)

  const client: PantheonClientFull = Object.defineProperties(
    clientFn as unknown as PantheonClientFull,
    {
      [coachClientSymbol]: { value: clientCtx },
      _ctx: { value: clientCtx },
      fetchMetadata: { value: fetchMetadata }
    }
  )

  return client
}

export function createPantheonClientFullExport(
  baseUrl: string,
  gameStateId: string | Promise<string>,
  tokenProvider: () => Promise<string>,
  options?: {
    logger?: Logger
    headers?: Record<string, string>
  },
  fetchFn?: typeof fetch
): PantheonClientFull {
  return createPantheonClientFullInternal(
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

export function createPantheonClientFullWithTransaction(
  transactionId: string,
  flushEdits: () => Promise<void>,
  ...args: Parameters<typeof createPantheonClientFullExport>
): PantheonClientFull {
  return createPantheonClientFullInternal(
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
