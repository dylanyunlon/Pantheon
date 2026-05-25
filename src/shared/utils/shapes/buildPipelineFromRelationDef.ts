import type { WhereClause, ObjectSet } from '../types'
import type { ShapeDefinition } from './applyShapeTransformations'

export interface RelationSegment {
  type: 'pivotTo'
  linkName: string
}

export interface SetOperation {
  type: 'union' | 'intersect' | 'subtract'
  other: RelationDef
}

export interface RelationOrderBy {
  property: string
  direction: 'asc' | 'desc'
}

export interface RelationDef {
  segments: RelationSegment[]
  where?: WhereClause
  orderBy?: RelationOrderBy[]
  limit?: number
  setOperations?: SetOperation[]
}

interface RelationQueryOptions {
  where?: WhereClause
  orderBy?: Record<string, 'asc' | 'desc'>
  pageSize?: number
}

export function getRelationQueryOptions(
  relationDef: RelationDef,
  sourcePrimaryKey: unknown,
  pageSize?: number
): RelationQueryOptions {
  const options: RelationQueryOptions = {}

  if (relationDef.where) {
    options.where = resolveSymbolBindings(
      relationDef.where,
      sourcePrimaryKey
    ) as WhereClause
  }

  if (relationDef.orderBy && relationDef.orderBy.length > 0) {
    options.orderBy = orderByToMap(relationDef.orderBy)
  }

  if (relationDef.limit !== undefined) {
    options.pageSize = relationDef.limit
  } else if (pageSize !== undefined) {
    options.pageSize = pageSize
  }

  return options
}

export function buildPipelineFromRelationDef(
  basePipelineSet: ObjectSet,
  sourcePrimaryKey: unknown,
  relationDef: RelationDef
): ObjectSet {
  let pipelineSet: ObjectSet = { ...basePipelineSet }

  for (const segment of relationDef.segments) {
    if (segment.type === 'pivotTo') {
      pipelineSet = {
        type: 'searchAround',
        objectType: pipelineSet.objectType,
        objectSets: [pipelineSet],
        where: { [segment.linkName]: { $eq: true } }
      }
    }
  }

  if (relationDef.setOperations && relationDef.setOperations.length > 0) {
    for (const setOp of relationDef.setOperations) {
      const otherSet = buildPipelineFromRelationDef(
        basePipelineSet,
        sourcePrimaryKey,
        setOp.other
      )
      switch (setOp.type) {
        case 'union':
          pipelineSet = {
            type: 'union',
            objectType: pipelineSet.objectType,
            objectSets: [pipelineSet, otherSet]
          }
          break
        case 'intersect':
          pipelineSet = {
            type: 'intersect',
            objectType: pipelineSet.objectType,
            objectSets: [pipelineSet, otherSet]
          }
          break
        case 'subtract':
          pipelineSet = {
            type: 'filter',
            objectType: pipelineSet.objectType,
            objectSets: [pipelineSet],
            where: {}
          }
          break
      }
    }
  }

  return pipelineSet
}

function orderByToMap(
  orderBy: readonly RelationOrderBy[]
): Record<string, 'asc' | 'desc'> {
  const result: Record<string, 'asc' | 'desc'> = {}
  for (const entry of orderBy) {
    result[entry.property] = entry.direction
  }
  return result
}

function resolveSymbolBindings(
  value: unknown,
  sourcePrimaryKey: unknown
): unknown {
  if (value != null && typeof value === 'object' && '__sourcePk' in (value as any)) {
    return sourcePrimaryKey
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveSymbolBindings(item, sourcePrimaryKey))
  }
  if (value != null && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value as object)) {
      result[key] = resolveSymbolBindings(val, sourcePrimaryKey)
    }
    return result
  }
  return value
}
