import type { InterfaceMetadata } from '../coach-types'
import type { MinimalCoachClient } from '../coach-client/MinimalCoachClientContext'

export async function loadInterfaceMetadata(
  client: MinimalCoachClient,
  apiName: string
): Promise<InterfaceMetadata> {
  const token = await client.tokenProvider()
  const gameStateId = typeof client.gameStateId === 'string'
    ? client.gameStateId
    : await client.gameStateId
  const resp = await client.fetchFn(
    `${client.baseUrl}/api/v2/coach/gameStates/${encodeURIComponent(gameStateId)}/interfaceTypes/${encodeURIComponent(apiName)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!resp.ok) throw new Error(`Failed to load interface metadata for ${apiName}: ${resp.status}`)
  return resp.json()
}
