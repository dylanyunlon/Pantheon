import type {
  ObjectTypeDefinition,
  InterfaceMetadata,
  ObjectMetadata,
  ActionDefinition,
  QueryDefinition,
  ObjectSet
} from '../types'
import type { MinimalPantheonClient } from './MinimalPantheonContext'

export interface PantheonClient {
  <Q extends ObjectTypeDefinition>(o: Q): ObjectSet

  fetchMetadata<Q extends ObjectTypeDefinition | ActionDefinition | QueryDefinition>(
    o: Q
  ): Promise<Q extends ObjectTypeDefinition ? ObjectMetadata
    : Q extends ActionDefinition ? ActionDefinition
    : never>

  readonly context: MinimalPantheonClient
}

export const clientContext: unique symbol = Symbol('clientContext')

const MaxPantheonVersion = '1.0.0'
export type MaxPantheonVersion = typeof MaxPantheonVersion

export type Client = any
