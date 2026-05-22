import type {
  ObjectMetadata,
  InterfaceMetadata,
  ActionDefinition,
  QueryDefinition
} from '../coach-types'
import type { MinimalCoachClient } from '../coach-client/MinimalCoachClientContext'

export const InterfaceDefinitions: unique symbol = Symbol('InterfaceDefinitions')

export interface FetchedObjectTypeDefinition extends ObjectMetadata {
  [InterfaceDefinitions]: {
    [key: string]: { def: InterfaceMetadata }
  }
}

export interface GameStateProvider {
  getObjectDefinition: (apiName: string) => Promise<FetchedObjectTypeDefinition>
  getInterfaceDefinition: (apiName: string) => Promise<InterfaceMetadata>
  getQueryDefinition: (apiName: string, version: string | undefined) => Promise<QueryDefinition>
  getActionDefinition: (apiName: string) => Promise<ActionDefinition>
}

export type GameStateProviderFactory<T extends GameStateProvider = GameStateProvider> = (
  client: MinimalCoachClient
) => T
