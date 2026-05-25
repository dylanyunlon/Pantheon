import type { MinimalPantheonClient } from '../client/MinimalPantheonClientContext'

export interface LcuBridgeContext {
  baseUrl: string
  tokenProvider: () => Promise<string>
  fetchFn: typeof globalThis.fetch
  gameStateId: string
}

export async function makeLcuBridgeContext(
  client: MinimalPantheonClient
): Promise<LcuBridgeContext> {
  const gameStateId = typeof client.gameStateId === 'string'
    ? client.gameStateId
    : await client.gameStateId

  return {
    baseUrl: client.baseUrl,
    tokenProvider: client.tokenProvider,
    fetchFn: client.fetchFn,
    gameStateId
  }
}
