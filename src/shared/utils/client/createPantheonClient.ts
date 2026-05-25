// @ts-nocheck
import type { Logger } from '../types'
import type { PantheonClient } from './PantheonClient'
import { clientContext } from './PantheonClient'
import { createMinimalPantheonClient } from './createMinimalPantheonClient'
import type { MinimalPantheonClient } from './MinimalPantheonContext'

export type PantheonPipelineFactory = (type: string, client: MinimalPantheonClient) => unknown

class PantheonActionInvoker {
  applyAction: (...args: any[]) => any
  batchApplyAction: (...args: any[]) => any

  constructor(clientCtx: MinimalPantheonClient, actionDef: { apiName: string }) {
    this.applyAction = async (params: unknown) => {
      return executePantheonAction(clientCtx, actionDef.apiName, params)
    }
    this.batchApplyAction = async (paramsBatch: unknown[]) => {
      const results = []
      for (const params of paramsBatch) {
        results.push(await executePantheonAction(clientCtx, actionDef.apiName, params))
      }
      return results
    }
  }
}

class PantheonQueryInvoker {
  executeFunction: (...args: any[]) => any

  constructor(clientCtx: MinimalPantheonClient, queryDef: { apiName: string }) {
    this.executeFunction = async (params: unknown) => {
      return executePantheonQuery(clientCtx, queryDef.apiName, params)
    }
  }
}

export function createPantheonClientInternal(
  pipelineFactory: PantheonPipelineFactory,
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
): PantheonClient {
  const clientCtx: MinimalPantheonClient = createMinimalPantheonClient(
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

  return createPantheonClientFromContext(clientCtx)
}

export function createPantheonClientFromContext(clientCtx: MinimalPantheonClient): PantheonClient {
  function clientFn(o: { type: string; apiName: string }): unknown {
    if (o.type === 'object' || o.type === 'interface') {
      return clientCtx.pipelineFactory(o.apiName, clientCtx)
    } else if (o.type === 'action') {
      return new PantheonActionInvoker(clientCtx, o)
    } else if (o.type === 'query') {
      return new PantheonQueryInvoker(clientCtx, o)
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

  const client: PantheonClient = Object.defineProperties(
    clientFn as unknown as PantheonClient,
    {
      [clientContext]: { value: clientCtx },
      context: { value: clientCtx },
      fetchMetadata: { value: fetchMetadata }
    }
  )

  return client
}

export function createPantheonClient(
  baseUrl: string,
  engineVersion: string,
  tokenProvider: () => Promise<string>,
  options?: {
    logger?: Logger
    branch?: string
    headers?: Record<string, string>
  },
  fetchFn?: typeof fetch
): PantheonClient {
  return createPantheonClientInternal(
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

export function createPantheonClientWithTransaction(
  transactionId: string,
  flushEdits: () => Promise<void>,
  ...args: Parameters<typeof createPantheonClient>
): PantheonClient {
  return createPantheonClientInternal(
    defaultPipelineFactory,
    transactionId,
    flushEdits,
    ...args
  )
}

function defaultPipelineFactory(type: string, _client: MinimalPantheonClient): unknown {
  return { type: 'base', objectType: type }
}

async function executePantheonAction(
  client: MinimalPantheonClient,
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

async function executePantheonQuery(
  client: MinimalPantheonClient,
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
