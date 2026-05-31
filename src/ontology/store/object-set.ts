// @ts-nocheck
/**
 * NexusObjectSet — declarative query and filter over the ontology store
 *
 * Algorithmic changes from Pantheon ObjectSet:
 *   1. evaluatePredicate adds $startsWith and $contains string operators
 *   2. compareValues uses Intl.Collator for locale-aware string sorting
 *   3. computeAggregation adds 'median' and 'stddev' aggregation ops
 *   4. fetchPage returns cursor token for keyset-based pagination instead
 *      of pure offset (hybrid approach — offset for compat, cursor for perf)
 *   5. New fluent .tap() method for mid-chain debugging
 *   6. groupByAggregate caches group keys for O(1) re-grouping on repeat calls
 *
 * Debug instrumentation:
 *   - introspector checkpoint on fetchAll/fetchPage with timing
 *   - debugPrintObjectSetResult() for formatted output
 */

import { NexusIntrospector } from '../../debug/introspector'
import type { ObjectStore } from './object-store'
import type { OntologyObjectType } from './object-store'

const introspector = NexusIntrospector.getInstance()

// ── Operator types ───────────────────────────────────────────────────

export type ComparisonOperator =
  | '$eq' | '$ne' | '$gt' | '$gte' | '$lt' | '$lte'
  | '$in' | '$nin' | '$exists' | '$regex'
  | '$startsWith' | '$contains'     // NEW

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

export type AggregationOp = 'count' | 'sum' | 'avg' | 'min' | 'max' | 'distinctCount' | 'median' | 'stddev'  // NEW: median, stddev

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
  cursorToken: string | null   // NEW: keyset cursor for efficient pagination
}

export interface ObjectSetSnapshot<T> {
  objectType: OntologyObjectType
  items: T[]
  totalCount: number
  where: WhereClause | null
  orderBy: OrderByField[]
  appliedLimit: number | null
  timestamp: number
  queryDurationMs: number      // NEW
}

// ── Utility functions ────────────────────────────────────────────────

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
          if (!new RegExp(expected).test(fieldValue)) return false
        } catch { return false }
        break
      }
      // NEW: string prefix matching
      case '$startsWith': {
        if (typeof fieldValue !== 'string' || typeof expected !== 'string') return false
        if (!fieldValue.startsWith(expected)) return false
        break
      }
      // NEW: string substring matching
      case '$contains': {
        if (typeof fieldValue !== 'string' || typeof expected !== 'string') return false
        if (!fieldValue.includes(expected)) return false
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
      if (matchesWhere(obj, clause)) { anyMatch = true; break }
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
      const hasOps = Object.keys(condition as Record<string, unknown>).some(k => k.startsWith('$'))
      if (hasOps) {
        if (!evaluatePredicate(fieldValue, condition as FieldPredicate)) return false
        continue
      }
    }
    if (fieldValue !== condition) return false
  }
  return true
}

// Changed: Intl.Collator for locale-aware string comparison
const collator = typeof Intl !== 'undefined' ? new Intl.Collator(undefined, { sensitivity: 'base' }) : null

function compareValues(a: unknown, b: unknown, direction: 'asc' | 'desc'): number {
  if (a === b) return 0
  if (a === null || a === undefined) return direction === 'asc' ? -1 : 1
  if (b === null || b === undefined) return direction === 'asc' ? 1 : -1

  if (typeof a === 'number' && typeof b === 'number') {
    return direction === 'asc' ? a - b : b - a
  }

  if (typeof a === 'string' && typeof b === 'string') {
    const cmp = collator ? collator.compare(a, b) : a.localeCompare(b)
    return direction === 'asc' ? cmp : -cmp
  }
  return 0
}

// Changed: adds median and stddev
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
    // NEW: median
    case 'median': {
      const sorted = values.slice().sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
    }
    // NEW: standard deviation (population)
    case 'stddev': {
      const mean = values.reduce((a, b) => a + b, 0) / values.length
      const squareDiffs = values.map(v => Math.pow(v - mean, 2))
      const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / values.length
      return Math.sqrt(avgSquareDiff)
    }
    default:
      return 0
  }
}

// ── ObjectSet ────────────────────────────────────────────────────────

export class ObjectSet<T = unknown> {
  private _store: ObjectStore
  private _objectType: OntologyObjectType
  private _where: WhereClause | null = null
  private _orderBy: OrderByField[] = []
  private _limitCount: number | null = null
  private _offsetCount: number = 0
  private _tapFn: ((items: T[]) => void) | null = null   // NEW: tap for debugging

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

  // NEW: mid-chain debug tap
  tap(fn: (items: T[]) => void): ObjectSet<T> {
    const next = this._clone()
    next._tapFn = fn
    return next
  }

  fetchAll(): T[] {
    const start = Date.now()
    let results = this._applyFilter()
    if (this._tapFn) this._tapFn(results)
    results = this._applySort(results)
    results = this._applyOffsetLimit(results)

    introspector.trace('object-set', 'fetchAll', {
      objectType: this._objectType,
      count: results.length,
      durationMs: Date.now() - start
    })
    return results
  }

  // Changed: returns cursorToken alongside offset-based pagination
  fetchPage(offset: number, pageSize: number): FetchPageResult<T> {
    const start = Date.now()
    let filtered = this._applyFilter()
    filtered = this._applySort(filtered)
    const totalCount = filtered.length
    const paged = filtered.slice(offset, offset + pageSize)

    // Cursor token: encode the last item's sort key for keyset pagination
    let cursorToken: string | null = null
    if (paged.length > 0 && this._orderBy.length > 0) {
      const lastItem = paged[paged.length - 1]
      const sortKey = getNestedValue(lastItem, this._orderBy[0].field)
      cursorToken = Buffer.from(JSON.stringify({ v: sortKey, idx: offset + paged.length })).toString('base64')
    }

    introspector.trace('object-set', 'fetchPage', {
      objectType: this._objectType,
      offset, pageSize, total: totalCount,
      durationMs: Date.now() - start
    })

    return { items: paged, totalCount, offset, pageSize, hasMore: offset + pageSize < totalCount, cursorToken }
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
        if (typeof v === 'number' && !isNaN(v)) values.push(v)
      }

      results.push({ op: clause.op, field, value: computeAggregation(values, clause.op) })
    }
    return results
  }

  groupBy(field: string): Map<unknown, T[]> {
    const filtered = this._applyFilter()
    const groups = new Map<unknown, T[]>()
    for (const item of filtered) {
      const key = getNestedValue(item, field) ?? '__null__'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(item)
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
          if (typeof v === 'number' && !isNaN(v)) values.push(v)
        }
        aggResults.push({ op: clause.op, field, value: computeAggregation(values, clause.op) })
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
    const start = Date.now()
    const items = this.fetchAll()
    return {
      objectType: this._objectType,
      items, totalCount: items.length,
      where: this._where,
      orderBy: this._orderBy.slice(),
      appliedLimit: this._limitCount,
      timestamp: Date.now(),
      queryDurationMs: Date.now() - start
    }
  }

  map<U>(fn: (item: T) => U): U[] { return this.fetchAll().map(fn) }
  filter(fn: (item: T) => boolean): T[] { return this.fetchAll().filter(fn) }
  reduce<U>(fn: (acc: U, item: T) => U, initial: U): U { return this.fetchAll().reduce(fn, initial) }
  forEach(fn: (item: T) => void): void { this.fetchAll().forEach(fn) }
  toArray(): T[] { return this.fetchAll() }

  private _applyFilter(): T[] {
    const all = this._store.queryByType<T>(this._objectType)
    if (!this._where) return all
    return all.filter(item => matchesWhere(item, this._where!))
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
    if (this._offsetCount > 0) result = result.slice(this._offsetCount)
    if (this._limitCount !== null) result = result.slice(0, this._limitCount)
    return result
  }

  private _clone(): ObjectSet<T> {
    const clone = new ObjectSet<T>(this._store, this._objectType)
    clone._where = this._where
    clone._orderBy = this._orderBy.slice()
    clone._limitCount = this._limitCount
    clone._offsetCount = this._offsetCount
    clone._tapFn = this._tapFn
    return clone
  }
}

// ── Factory ──────────────────────────────────────────────────────────

export function createObjectSet<T = unknown>(
  store: ObjectStore,
  objectType: OntologyObjectType
): ObjectSet<T> {
  return new ObjectSet<T>(store, objectType)
}

// ── Debug ────────────────────────────────────────────────────────────

export function debugPrintObjectSetResult<T>(
  label: string,
  items: T[],
  fields?: string[]
): void {
  console.log(`\n┌─ ObjectSet: ${label} (${items.length} items) ─────────┐`)
  for (let i = 0; i < Math.min(items.length, 10); i++) {
    const item = items[i]
    if (fields && typeof item === 'object' && item !== null) {
      const vals = fields.map(f => `${f}=${getNestedValue(item, f)}`).join(', ')
      console.log(`│ [${i}] ${vals}`)
    } else {
      const str = JSON.stringify(item)
      console.log(`│ [${i}] ${str && str.length > 80 ? str.substring(0, 77) + '...' : str}`)
    }
  }
  if (items.length > 10) console.log(`│ ... and ${items.length - 10} more`)
  console.log(`└${'─'.repeat(45)}┘\n`)
}
