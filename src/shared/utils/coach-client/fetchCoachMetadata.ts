import type { MinimalCoachClient } from './MinimalCoachContext'
import type {
  ObjectTypeDefinition,
  ActionDefinition,
  QueryDefinition,
  ObjectMetadata,
  InterfaceMetadata
} from '../coach-types'

export const fetchCoachMetadataInternal = async <
  Q extends ObjectTypeDefinition | ActionDefinition | QueryDefinition
>(
  client: MinimalCoachClient,
  definition: Q
): Promise<
  Q extends ObjectTypeDefinition ? ObjectMetadata
    : Q extends ActionDefinition ? ActionDefinition
    : Q extends QueryDefinition ? QueryDefinition
    : never
> => {
  const token = await client.tokenProvider()
  const apiName = (definition as any).apiName

  const resp = await client.fetchFn(
    `${client.baseUrl}/api/v1/coach/metadata/${definition.type || 'object'}/${apiName}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!resp.ok) throw new Error(`Metadata fetch failed for ${apiName}: ${resp.status}`)
  return resp.json() as any
}
