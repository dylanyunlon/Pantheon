import type { WhereClause, ObjectSet } from '../types'
import type { DerivedStatDefinition, DerivedStatOps } from './derivedStatDefinitionFactory'
import { derivedStatDefinitionFactory } from './derivedStatDefinitionFactory'
import { modernToLegacyWhereClause } from '../internal/conversions/modernToLegacyWhereClause'

export interface SelectedStatOperation {
  type: string
  selectedPropertyApiName?: string
  approximatePercentile?: number
  limit?: number
}

export interface StatPropertyBuilder {
  pivotTo(link: string): StatPropertyBuilder
  where(clause: WhereClause | null): StatPropertyBuilder
  aggregate(aggregation: string, opt?: { percentile?: number; limit?: number }): DerivedStatOps
  selectProperty(name: string): DerivedStatOps
}

export function createWithStatsPipeline(
  objectType: string,
  pipelineSet: ObjectSet,
  definitionMap: Map<any, DerivedStatDefinition>,
  fromBasePipeline: boolean = false
): StatPropertyBuilder {
  return {
    pivotTo: (link) => {
      return createWithStatsPipeline(objectType, {
        type: 'searchAround',
        objectType: pipelineSet.objectType,
        objectSets: [pipelineSet],
        where: { [link]: { $eq: true } }
      }, definitionMap)
    },

    where: (clause) => {
      if (clause == null || Object.keys(clause).length === 0) {
        return createWithStatsPipeline(objectType, pipelineSet, definitionMap)
      }
      return createWithStatsPipeline(objectType, {
        type: 'filter',
        objectType: pipelineSet.objectType,
        objectSets: [pipelineSet],
        where: clause
      }, definitionMap)
    },

    aggregate: (aggregation: string, opt?: { percentile?: number; limit?: number }) => {
      const splitAggregation = aggregation.split(':')
      if (splitAggregation.length !== 2 && splitAggregation[0] !== '$count') {
        throw new Error('Invalid aggregation format')
      }
      const [aggregationPropertyName, aggregationOperation] = splitAggregation
      let aggregationOpDef: SelectedStatOperation

      switch (aggregationOperation) {
        case 'sum':
        case 'avg':
        case 'min':
        case 'max':
        case 'exactDistinct':
        case 'approximateDistinct':
          aggregationOpDef = {
            type: aggregationOperation,
            selectedPropertyApiName: aggregationPropertyName
          }
          break
        case 'approximatePercentile':
          aggregationOpDef = {
            type: 'approximatePercentile',
            selectedPropertyApiName: aggregationPropertyName,
            approximatePercentile: opt?.percentile ?? 0.5
          }
          break
        case 'collectSet':
        case 'collectList':
          aggregationOpDef = {
            type: aggregationOperation,
            selectedPropertyApiName: aggregationPropertyName,
            limit: opt?.limit ?? 100
          }
          break
        case undefined:
          if (aggregationPropertyName === '$count') {
            aggregationOpDef = { type: 'count' }
            break
          }
        default:
          throw new Error('Invalid aggregation operation: ' + aggregationOperation)
      }

      const wrappedDef: DerivedStatDefinition = {
        type: 'selection',
        objectSet: pipelineSet,
        operation: aggregationOpDef
      }
      const selectorResult = derivedStatDefinitionFactory(wrappedDef, definitionMap)
      definitionMap.set(selectorResult, wrappedDef)
      return selectorResult
    },

    selectProperty: (name: string) => {
      if (fromBasePipeline) {
        const wrappedDef: DerivedStatDefinition = { type: 'property', apiName: name }
        const selectorResult = derivedStatDefinitionFactory(wrappedDef, definitionMap)
        definitionMap.set(selectorResult, wrappedDef)
        return selectorResult
      }
      const wrappedDef: DerivedStatDefinition = {
        type: 'selection',
        objectSet: pipelineSet,
        operation: { type: 'get', selectedPropertyApiName: name }
      }
      const selectorResult = derivedStatDefinitionFactory(wrappedDef, definitionMap)
      definitionMap.set(selectorResult, wrappedDef)
      return selectorResult
    }
  }
}
