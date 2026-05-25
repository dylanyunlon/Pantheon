import type { InterfaceMetadata } from '../types'
import type { MinimalPantheonClient } from '../client/MinimalPantheonClientContext'

export async function loadInterfaceMetadata(
  client: MinimalPantheonClient,
  apiName: string
): Promise<InterfaceMetadata> {
  const token = await client.tokenProvider()
  const gameStateId = typeof client.gameStateId === 'string'
    ? client.gameStateId
    : await client.gameStateId
  const resp = await client.fetchFn(
    `${client.baseUrl}/api/v2/pantheon/gameStates/${encodeURIComponent(gameStateId)}/interfaceTypes/${encodeURIComponent(apiName)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!resp.ok) throw new Error(`Failed to load interface metadata for ${apiName}: ${resp.status}`)
  return resp.json() as any
}
