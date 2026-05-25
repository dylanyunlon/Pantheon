import type {
  ObjectTypeDefinition,
  InterfaceMetadata,
  ObjectMetadata,
  ActionDefinition,
  QueryDefinition,
  ObjectSet
} from '../coach-types'
import type { MinimalCoachClient } from './MinimalCoachContext'

export interface CoachClient {
  <Q extends ObjectTypeDefinition>(o: Q): ObjectSet

  fetchMetadata<Q extends ObjectTypeDefinition | ActionDefinition | QueryDefinition>(
    o: Q
  ): Promise<Q extends ObjectTypeDefinition ? ObjectMetadata
    : Q extends ActionDefinition ? ActionDefinition
    : never>

  readonly context: MinimalCoachClient
}

export const coachClientContext: unique symbol = Symbol('coachClientContext')

const MaxCoachVersion = '1.0.0'
export type MaxCoachVersion = typeof MaxCoachVersion

export type Client = any
