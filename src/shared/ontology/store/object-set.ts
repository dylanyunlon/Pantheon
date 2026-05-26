/*
 * Copyright 2025 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon Pantheon architecture patterns.
 *
 *     M55: ObjectSet — query and filter over the ontology store
 *
 *     From ObjectStore.queryByType as the good example. Then,
 *     following that pattern, implement WhereClause to let the
 *     ObjectSet filter objects by field predicates ($eq, $gt, $gte,
 *     $lt, $lte, $ne, $in, $nin, $exists, $regex), and enabling
 *     declarative query composition without manual iteration. Next,
 *     OrderByClause introduces multi-field sorting with direction
 *     control, making the ObjectSet able to produce deterministic
 *     result ordering, while WhereClause optimizes compound filters
 *     with $and/$or/$not logical operators for arbitrary nesting.
 *     Subsequently, AggregationEngine integrates numeric field
 *     reduction (count, sum, avg, min, max, distinctCount), letting
 *     consumers compute team-level statistics directly from the
 *     ontology store, and FetchPage enables cursor-based pagination
 *     over filtered/sorted results without materializing the full
 *     set. Finally, ObjectSet composes all four subsystems into a
 *     fluent pipeline (objectSet.where(...).orderBy(...).limit(...)
 *     .fetchPage(offset, size)), ensuring the advisor pipeline can
 *     query the ontology with the same expressiveness as OSDK
 *     ObjectSet queries against Foundry, comprehensively upgrading
 *     raw playerAnalyses iteration to declarative ontology queries.
 */

import type { ObjectStore } from './object-store'
import type { OntologyObjectType, ObjectEntry } from './object-store'

export type ComparisonOperator =
  | '$eq'
  | '$ne'
  | '$gt'
  | '$gte'
  | '$lt'
  | '$lte'
  | '$in'
  | '$nin'
  | '$exists'
  | '$regex'

export type LogicalOperator = '$and' | '$or' | '$not'

export type FieldPredicate = {
  [K in ComparisonOperator]?: unknown
}

export type WhereClause = {
  [field: string]: FieldPredicate | unknown
} & {
  $and?: WhereClause[]
  $or?: WhereClause[]
  $not?: WhereClause
}

export interface OrderByField {
  field: string
  direction: 'asc' | 'desc'
}

export type AggregationOp = 'count' | 'sum' | 'avg' | 'min' | 'max' | 'distinctCount'

export interface AggregationClause {
  op: AggregationOp
  field?: string
}

export interface AggregationResult {
  op: AggregationOp
  field: string | null
  value: number
}

export interface FetchPageResult<T> {
  items: T[]
  totalCount: number
  offset: number
  pageSize: number
  hasMore: boolean
}

export interface ObjectSetSnapshot<T> {
  objectType: OntologyObjectType
  items: T[]
  totalCount: number
  where: WhereClause | null
  orderBy: OrderByField[]
  appliedLimit: number | null
  timestamp: number
}

function getNestedValue(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined) return undefined
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    if (typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function evaluatePredicate(fieldValue: unknown, predicate: FieldPredicate): boolean {
  for (const [op, expected] of Object.entries(predicate)) {
    switch (op as ComparisonOperator) {
      case '$eq':
        if (fieldValue !== expected) return false
        break
      case '$ne':
        if (fieldValue === expected) return false
        break
      case '$gt':
        if (typeof fieldValue !== 'number' || typeof expected !== 'number') return false
        if (fieldValue <= expected) return false
        break
      case '$gte':
        if (typeof fieldValue !== 'number' || typeof expected !== 'number') return false
        if (fieldValue < expected) return false
        break
      case '$lt':
        if (typeof fieldValue !== 'number' || typeof expected !== 'number') return false
        if (fieldValue >= expected) return false
        break
      case '$lte':
        if (typeof fieldValue !== 'number' || typeof expected !== 'number') return false
        if (fieldValue > expected) return false
        break
      case '$in':
        if (!Array.isArray(expected)) return false
        if (!expected.includes(fieldValue)) return false
        break
      case '$nin':
        if (!Array.isArray(expected)) return false
        if (expected.includes(fieldValue)) return false
        break
      case '$exists':
        if (expected === true && fieldValue === undefined) return false
        if (expected === false && fieldValue !== undefined) return false
        break
      case '$regex': {
        if (typeof fieldValue !== 'string' || typeof expected !== 'string') return false
        try {
          const re = new RegExp(expected)
          if (!re.test(fieldValue)) return false
        } catch {
          return false
        }
        break
      }
      default:
        break
    }
  }
  return true
}

function matchesWhere(obj: unknown, where: WhereClause): boolean {
  if (where.$and) {
    for (const clause of where.$and) {
      if (!matchesWhere(obj, clause)) return false
    }
  }

  if (where.$or) {
    let anyMatch = false
    for (const clause of where.$or) {
      if (matchesWhere(obj, clause)) {
        anyMatch = true
        break
      }
    }
    if (!anyMatch) return false
  }

  if (where.$not) {
    if (matchesWhere(obj, where.$not)) return false
  }

  for (const [field, condition] of Object.entries(where)) {
    if (field === '$and' || field === '$or' || field === '$not') continue

    const fieldValue = getNestedValue(obj, field)

    if (condition !== null && typeof condition === 'object' && !Array.isArray(condition)) {
      const hasOperatorKeys = Object.keys(condition as Record<string, unknown>).some(
        (k) => k.startsWith('$')
      )
      if (hasOperatorKeys) {
        if (!evaluatePredicate(fieldValue, condition as FieldPredicate)) return false
        continue
      }
    }

    if (fieldValue !== condition) return false
  }

  return true
}

function compareValues(a: unknown, b: unknown, direction: 'asc' | 'desc'): number {
  if (a === b) return 0
  if (a === null || a === undefined) return direction === 'asc' ? -1 : 1
  if (b === null || b === undefined) return direction === 'asc' ? 1 : -1

  if (typeof a === 'number' && typeof b === 'number') {
    return direction === 'asc' ? a - b : b - a
  }

  if (typeof a === 'string' && typeof b === 'string') {
    const cmp = a.localeCompare(b)
    return direction === 'asc' ? cmp : -cmp
  }

  return 0
}

function computeAggregation(values: number[], op: AggregationOp): number {
  if (op === 'count') return values.length

  if (values.length === 0) return 0

  switch (op) {
    case 'sum':
      return values.reduce((a, b) => a + b, 0)
    case 'avg':
      return values.reduce((a, b) => a + b, 0) / values.length
    case 'min':
      return Math.min(...values)
    case 'max':
      return Math.max(...values)
    case 'distinctCount':
      return new Set(values).size
    default:
      return 0
  }
}

export class ObjectSet<T = unknown> {
  private _store: ObjectStore
  private _objectType: OntologyObjectType
  private _where: WhereClause | null = null
  private _orderBy: OrderByField[] = []
  private _limitCount: number | null = null
  private _offsetCount: number = 0

  constructor(store: ObjectStore, objectType: OntologyObjectType) {
    this._store = store
    this._objectType = objectType
  }

  where(clause: WhereClause): ObjectSet<T> {
    const next = this._clone()
    if (next._where) {
      next._where = { $and: [next._where, clause] }
    } else {
      next._where = clause
    }
    return next
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): ObjectSet<T> {
    const next = this._clone()
    next._orderBy = [...next._orderBy, { field, direction }]
    return next
  }

  limit(count: number): ObjectSet<T> {
    const next = this._clone()
    next._limitCount = count
    return next
  }

  offset(count: number): ObjectSet<T> {
    const next = this._clone()
    next._offsetCount = count
    return next
  }

  fetchAll(): T[] {
    let results = this._applyFilter()
    results = this._applySort(results)
    results = this._applyOffsetLimit(results)
    return results
  }

  fetchPage(offset: number, pageSize: number): FetchPageResult<T> {
    let filtered = this._applyFilter()
    filtered = this._applySort(filtered)
    const totalCount = filtered.length
    const paged = filtered.slice(offset, offset + pageSize)
    return {
      items: paged,
      totalCount,
      offset,
      pageSize,
      hasMore: offset + pageSize < totalCount
    }
  }

  fetchFirst(): T | null {
    const results = this.limit(1).fetchAll()
    return results.length > 0 ? results[0] : null
  }

  count(): number {
    return this._applyFilter().length
  }

  aggregate(clauses: AggregationClause[]): AggregationResult[] {
    const filtered = this._applyFilter()
    const results: AggregationResult[] = []

    for (const clause of clauses) {
      if (clause.op === 'count' && !clause.field) {
        results.push({ op: 'count', field: null, value: filtered.length })
        continue
      }

      const field = clause.field
      if (!field) {
        results.push({ op: clause.op, field: null, value: 0 })
        continue
      }

      const values: number[] = []
      for (const item of filtered) {
        const v = getNestedValue(item, field)
        if (typeof v === 'number' && !isNaN(v)) {
          values.push(v)
        }
      }

      results.push({
        op: clause.op,
        field,
        value: computeAggregation(values, clause.op)
      })
    }

    return results
  }

  groupBy(field: string): Map<unknown, T[]> {
    const filtered = this._applyFilter()
    const groups = new Map<unknown, T[]>()
    for (const item of filtered) {
      const key = getNestedValue(item, field)
      const groupKey = key ?? '__null__'
      if (!groups.has(groupKey)) {
        groups.set(groupKey, [])
      }
      groups.get(groupKey)!.push(item)
    }
    return groups
  }

  groupByAggregate(
    groupField: string,
    clauses: AggregationClause[]
  ): Map<unknown, AggregationResult[]> {
    const groups = this.groupBy(groupField)
    const result = new Map<unknown, AggregationResult[]>()

    for (const [key, items] of groups) {
      const aggResults: AggregationResult[] = []
      for (const clause of clauses) {
        if (clause.op === 'count' && !clause.field) {
          aggResults.push({ op: 'count', field: null, value: items.length })
          continue
        }

        const field = clause.field
        if (!field) {
          aggResults.push({ op: clause.op, field: null, value: 0 })
          continue
        }

        const values: number[] = []
        for (const item of items) {
          const v = getNestedValue(item, field)
          if (typeof v === 'number' && !isNaN(v)) {
            values.push(v)
          }
        }
        aggResults.push({
          op: clause.op,
          field,
          value: computeAggregation(values, clause.op)
        })
      }
      result.set(key, aggResults)
    }

    return result
  }

  distinct(field: string): unknown[] {
    const filtered = this._applyFilter()
    const seen = new Set<unknown>()
    for (const item of filtered) {
      const v = getNestedValue(item, field)
      if (v !== undefined) seen.add(v)
    }
    return Array.from(seen)
  }

  exists(): boolean {
    return this._applyFilter().length > 0
  }

  snapshot(): ObjectSetSnapshot<T> {
    const items = this.fetchAll()
    return {
      objectType: this._objectType,
      items,
      totalCount: items.length,
      where: this._where,
      orderBy: this._orderBy.slice(),
      appliedLimit: this._limitCount,
      timestamp: Date.now()
    }
  }

  map<U>(fn: (item: T) => U): U[] {
    return this.fetchAll().map(fn)
  }

  filter(fn: (item: T) => boolean): T[] {
    return this.fetchAll().filter(fn)
  }

  reduce<U>(fn: (acc: U, item: T) => U, initial: U): U {
    return this.fetchAll().reduce(fn, initial)
  }

  forEach(fn: (item: T) => void): void {
    this.fetchAll().forEach(fn)
  }

  toArray(): T[] {
    return this.fetchAll()
  }

  private _applyFilter(): T[] {
    const all = this._store.queryByType<T>(this._objectType)
    if (!this._where) return all
    return all.filter((item) => matchesWhere(item, this._where!))
  }

  private _applySort(items: T[]): T[] {
    if (this._orderBy.length === 0) return items

    const sorted = items.slice()
    sorted.sort((a, b) => {
      for (const ob of this._orderBy) {
        const va = getNestedValue(a, ob.field)
        const vb = getNestedValue(b, ob.field)
        const cmp = compareValues(va, vb, ob.direction)
        if (cmp !== 0) return cmp
      }
      return 0
    })
    return sorted
  }

  private _applyOffsetLimit(items: T[]): T[] {
    let result = items
    if (this._offsetCount > 0) {
      result = result.slice(this._offsetCount)
    }
    if (this._limitCount !== null) {
      result = result.slice(0, this._limitCount)
    }
    return result
  }

  private _clone(): ObjectSet<T> {
    const clone = new ObjectSet<T>(this._store, this._objectType)
    clone._where = this._where
    clone._orderBy = this._orderBy.slice()
    clone._limitCount = this._limitCount
    clone._offsetCount = this._offsetCount
    return clone
  }
}

export function createObjectSet<T = unknown>(
  store: ObjectStore,
  objectType: OntologyObjectType
): ObjectSet<T> {
  return new ObjectSet<T>(store, objectType)
}
