import type {
  ActionDefinition,
  InterfaceMetadata,
  ObjectMetadata,
  ObjectTypeDefinition,
  QueryDefinition
} from '../coach-types'
import type { MinimalCoachClient } from './MinimalCoachClientContext'

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
  const defType = (definition as any).type
  const apiName = (definition as any).apiName || (definition as any).unsanitizedApiName

  if (defType === 'object') {
    return client.gameStateProvider.getObjectDefinition(apiName) as any
  } else if (defType === 'interface') {
    return client.gameStateProvider.getInterfaceDefinition(apiName) as any
  } else if (defType === 'action') {
    return client.gameStateProvider.getActionDefinition(apiName) as any
  } else if (defType === 'query') {
    return client.gameStateProvider.getQueryDefinition(apiName, undefined) as any
  }
  throw new Error('Unsupported metadata definition type: ' + defType)
}
