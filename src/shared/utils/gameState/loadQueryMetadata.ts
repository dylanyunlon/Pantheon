import type { QueryDefinition } from '../types'
import type { MinimalPantheonClient } from '../client/MinimalPantheonClientContext'

export async function loadQueryMetadata(
  client: MinimalPantheonClient,
  key: string
): Promise<QueryDefinition> {
  const [apiName, version] = key.split(':')
  const token = await client.tokenProvider()
  const gameStateId = typeof client.gameStateId === 'string'
    ? client.gameStateId
    : await client.gameStateId
  let url = `${client.baseUrl}/api/v2/pantheon/gameStates/${encodeURIComponent(gameStateId)}/queryTypes/${encodeURIComponent(apiName)}`
  if (version) url += `?version=${encodeURIComponent(version)}`
  const resp = await client.fetchFn(url, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!resp.ok) throw new Error(`Failed to load query metadata for ${apiName}: ${resp.status}`)
  return resp.json() as any
}

export const loadGameStateQueryMetadata: any = undefined
