import type { Logger } from '../coach-types'
import type { CoachClient } from './CoachClient'
import { coachClientContext } from './CoachClient'
import { createMinimalCoachClient } from './createMinimalCoachClient'
import type { MinimalCoachClient } from './MinimalCoachContext'

export type CoachPipelineFactory = (type: string, client: MinimalCoachClient) => unknown

class CoachActionInvoker {
  applyAction: (...args: any[]) => any
  batchApplyAction: (...args: any[]) => any

  constructor(clientCtx: MinimalCoachClient, actionDef: { apiName: string }) {
    this.applyAction = async (params: unknown) => {
      return executeCoachAction(clientCtx, actionDef.apiName, params)
    }
    this.batchApplyAction = async (paramsBatch: unknown[]) => {
      const results = []
      for (const params of paramsBatch) {
        results.push(await executeCoachAction(clientCtx, actionDef.apiName, params))
      }
      return results
    }
  }
}

class CoachQueryInvoker {
  executeFunction: (...args: any[]) => any

  constructor(clientCtx: MinimalCoachClient, queryDef: { apiName: string }) {
    this.executeFunction = async (params: unknown) => {
      return executeCoachQuery(clientCtx, queryDef.apiName, params)
    }
  }
}

export function createCoachClientInternal(
  pipelineFactory: CoachPipelineFactory,
  transactionId: string | undefined,
  flushEdits: (() => Promise<void>) | undefined,
  baseUrl: string,
  engineVersion: string,
  tokenProvider: () => Promise<string>,
  options: {
    logger?: Logger
    branch?: string
    headers?: Record<string, string>
  } | undefined = undefined,
  fetchFn: typeof globalThis.fetch = fetch
): CoachClient {
  const clientCtx: MinimalCoachClient = createMinimalCoachClient(
    { engineVersion },
    baseUrl,
    tokenProvider,
    {
      ...options,
      transactionId,
      flushEdits,
      branch: options?.branch
    },
    fetchFn,
    pipelineFactory
  )

  return createCoachClientFromContext(clientCtx)
}

export function createCoachClientFromContext(clientCtx: MinimalCoachClient): CoachClient {
  function clientFn(o: { type: string; apiName: string }): unknown {
    if (o.type === 'object' || o.type === 'interface') {
      return clientCtx.pipelineFactory(o.apiName, clientCtx)
    } else if (o.type === 'action') {
      return new CoachActionInvoker(clientCtx, o)
    } else if (o.type === 'query') {
      return new CoachQueryInvoker(clientCtx, o)
    }
    throw new Error('Unsupported definition type: ' + o.type)
  }

  const fetchMetadata = async (o: { type: string; apiName: string }) => {
    const token = await clientCtx.tokenProvider()
    const resp = await clientCtx.fetchFn(
      `${clientCtx.baseUrl}/api/v1/coach/metadata/${o.apiName}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!resp.ok) throw new Error(`Metadata fetch failed: ${resp.status}`)
    return resp.json()
  }

  const client: CoachClient = Object.defineProperties(
    clientFn as unknown as CoachClient,
    {
      [coachClientContext]: { value: clientCtx },
      context: { value: clientCtx },
      fetchMetadata: { value: fetchMetadata }
    }
  )

  return client
}

export function createCoachClient(
  baseUrl: string,
  engineVersion: string,
  tokenProvider: () => Promise<string>,
  options?: {
    logger?: Logger
    branch?: string
    headers?: Record<string, string>
  },
  fetchFn?: typeof fetch
): CoachClient {
  return createCoachClientInternal(
    defaultPipelineFactory,
    undefined,
    undefined,
    baseUrl,
    engineVersion,
    tokenProvider,
    options,
    fetchFn
  )
}

export function createCoachClientWithTransaction(
  transactionId: string,
  flushEdits: () => Promise<void>,
  ...args: Parameters<typeof createCoachClient>
): CoachClient {
  return createCoachClientInternal(
    defaultPipelineFactory,
    transactionId,
    flushEdits,
    ...args
  )
}

function defaultPipelineFactory(type: string, _client: MinimalCoachClient): unknown {
  return { type: 'base', objectType: type }
}

async function executeCoachAction(
  client: MinimalCoachClient,
  actionApiName: string,
  params: unknown
): Promise<unknown> {
  const token = await client.tokenProvider()
  const resp = await client.fetchFn(
    `${client.baseUrl}/api/v1/coach/actions/${actionApiName}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    }
  )
  if (!resp.ok) throw new Error(`Coach action failed: ${resp.status}`)
  return resp.json()
}

async function executeCoachQuery(
  client: MinimalCoachClient,
  queryApiName: string,
  params: unknown
): Promise<unknown> {
  const token = await client.tokenProvider()
  const resp = await client.fetchFn(
    `${client.baseUrl}/api/v1/coach/queries/${queryApiName}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    }
  )
  if (!resp.ok) throw new Error(`Coach query failed: ${resp.status}`)
  return resp.json()
}
