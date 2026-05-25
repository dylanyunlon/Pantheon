import type { ActionDefinition } from '../types'
import type { MinimalPantheonClient } from '../client/MinimalPantheonClientContext'

export async function loadActionMetadata(
  client: MinimalPantheonClient,
  apiName: string
): Promise<ActionDefinition> {
  const token = await client.tokenProvider()
  const gameStateId = typeof client.gameStateId === 'string'
    ? client.gameStateId
    : await client.gameStateId
  const resp = await client.fetchFn(
    `${client.baseUrl}/api/v2/pantheon/gameStates/${encodeURIComponent(gameStateId)}/actionTypes/${encodeURIComponent(apiName)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!resp.ok) throw new Error(`Failed to load action metadata for ${apiName}: ${resp.status}`)
  return resp.json() as any
}
