import type { ActionDefinition } from '../coach-types'
import type { MinimalCoachClient } from '../coach-client/MinimalCoachClientContext'

export async function loadActionMetadata(
  client: MinimalCoachClient,
  apiName: string
): Promise<ActionDefinition> {
  const token = await client.tokenProvider()
  const gameStateId = typeof client.gameStateId === 'string'
    ? client.gameStateId
    : await client.gameStateId
  const resp = await client.fetchFn(
    `${client.baseUrl}/api/v2/coach/gameStates/${encodeURIComponent(gameStateId)}/actionTypes/${encodeURIComponent(apiName)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!resp.ok) throw new Error(`Failed to load action metadata for ${apiName}: ${resp.status}`)
  return resp.json()
}
