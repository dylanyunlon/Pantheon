import type { ObjectMetadata } from '../types'
import type { MinimalPantheonClient } from '../client/MinimalPantheonClientContext'

export async function loadFullObjectMetadata(
  client: MinimalPantheonClient,
  apiName: string
): Promise<ObjectMetadata> {
  const token = await client.tokenProvider()
  const gameStateId = typeof client.gameStateId === 'string'
    ? client.gameStateId
    : await client.gameStateId
  const resp = await client.fetchFn(
    `${client.baseUrl}/api/v2/pantheon/gameStates/${encodeURIComponent(gameStateId)}/objectTypes/${encodeURIComponent(apiName)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!resp.ok) throw new Error(`Failed to load object metadata for ${apiName}: ${resp.status}`)
  return resp.json() as any
}

export const loadFullGameStateMetadata: any = undefined
