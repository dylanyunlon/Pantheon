export interface DerivedStatDefinition {
  type: string
  property?: DerivedStatDefinition
  properties?: DerivedStatDefinition[]
  left?: DerivedStatDefinition
  right?: DerivedStatDefinition
  apiName?: string
  part?: string
  objectSet?: unknown
  operation?: unknown
}

export interface DerivedStatOps {
  abs(): DerivedStatOps
  negate(): DerivedStatOps
  max(value: DerivedStatOps | string): DerivedStatOps
  min(value: DerivedStatOps | string): DerivedStatOps
  add(value: DerivedStatOps | string): DerivedStatOps
  subtract(value: DerivedStatOps | string): DerivedStatOps
  multiply(value: DerivedStatOps | string): DerivedStatOps
  divide(value: DerivedStatOps | string): DerivedStatOps
  extractPart(part: string): DerivedStatOps
}

export function derivedStatDefinitionFactory(
  wireDefinition: DerivedStatDefinition,
  definitionMap: Map<any, DerivedStatDefinition>
): DerivedStatOps {
  const definition: DerivedStatOps = {
    abs() {
      return derivedStatDefinitionFactory(
        { type: 'absoluteValue', property: wireDefinition },
        definitionMap
      )
    },
    negate() {
      return derivedStatDefinitionFactory(
        { type: 'negate', property: wireDefinition },
        definitionMap
      )
    },
    max(value) {
      return derivedStatDefinitionFactory(
        {
          type: 'greatest',
          properties: [wireDefinition, getDefinitionFromMap(value, definitionMap)]
        },
        definitionMap
      )
    },
    min(value) {
      return derivedStatDefinitionFactory(
        {
          type: 'least',
          properties: [wireDefinition, getDefinitionFromMap(value, definitionMap)]
        },
        definitionMap
      )
    },
    add(value) {
      return derivedStatDefinitionFactory(
        {
          type: 'add',
          properties: [wireDefinition, getDefinitionFromMap(value, definitionMap)]
        },
        definitionMap
      )
    },
    subtract(value) {
      return derivedStatDefinitionFactory(
        {
          type: 'subtract',
          left: wireDefinition,
          right: getDefinitionFromMap(value, definitionMap)
        },
        definitionMap
      )
    },
    multiply(value) {
      return derivedStatDefinitionFactory(
        {
          type: 'multiply',
          properties: [wireDefinition, getDefinitionFromMap(value, definitionMap)]
        },
        definitionMap
      )
    },
    divide(value) {
      return derivedStatDefinitionFactory(
        {
          type: 'divide',
          left: wireDefinition,
          right: getDefinitionFromMap(value, definitionMap)
        },
        definitionMap
      )
    },
    extractPart(part: string) {
      return derivedStatDefinitionFactory(
        { type: 'extract', part, property: wireDefinition },
        definitionMap
      )
    }
  }

  definitionMap.set(definition, wireDefinition)
  return definition
}

function getDefinitionFromMap(
  arg: string | number | DerivedStatOps,
  definitionMap: Map<any, DerivedStatDefinition>
): DerivedStatDefinition {
  if (typeof arg === 'object') {
    const definition = definitionMap.get(arg)
    if (!definition) throw new Error('Derived stat is not defined')
    return definition
  }
  throw new Error('Literal values for derived stats are not yet supported')
}
