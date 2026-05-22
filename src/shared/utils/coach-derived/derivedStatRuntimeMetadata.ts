import type { DerivedStatDefinition } from './derivedStatDefinitionFactory'
import type { PropertyDefinition } from '../coach-types'

export type DerivedStatRuntimeMetadata = Record<string, {
  definition: DerivedStatDefinition
  selectedOrCollectedPropertyType: PropertyDefinition | undefined
}>
