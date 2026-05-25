import type { ObjectMetadata } from '../coach-types'
import type { MinimalCoachClient } from '../coach-client/MinimalCoachClientContext'

export async function loadFullObjectMetadata(
  client: MinimalCoachClient,
  apiName: string
): Promise<ObjectMetadata> {
  const token = await client.tokenProvider()
  const gameStateId = typeof client.gameStateId === 'string'
    ? client.gameStateId
    : await client.gameStateId
  const resp = await client.fetchFn(
    `${client.baseUrl}/api/v2/coach/gameStates/${encodeURIComponent(gameStateId)}/objectTypes/${encodeURIComponent(apiName)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!resp.ok) throw new Error(`Failed to load object metadata for ${apiName}: ${resp.status}`)
  return resp.json() as any
}

export const loadFullGameStateMetadata: any = undefined
