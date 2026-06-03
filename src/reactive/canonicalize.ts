// @ts-nocheck
/**
 * canonicalize.ts — OSDK-pattern algorithms ported from palantir/osdk-ts
 *
 * Trie: key-sequence → value store with branch pruning on remove
 *   (from @wry/trie, used by GenericCanonicalizer + WhereClauseCanonicalizer + CacheKeys)
 *
 * TrieCanonicalizer: structural identity dedup
 *   same structure → same object reference, regardless of key insertion order
 *   uses sorted-key fingerprint → trie bucket → deepEqual disambiguation
 *   WeakRef in buckets so GC can reclaim dead canonicals
 *   (from GenericCanonicalizer + CachingCanonicalizer)
 *
 * WhereCanonicalizer: query predicate normalization
 *   $and with 0 children → {} (noop)
 *   $and with 1 child → unwrap to that child
 *   { field: { $eq: val } } → { field: val } (shorthand)
 *   keys sorted for structural identity
 *   two-level cache: WeakMap identity fast-path + trie structural slow-path
 *   (from WhereClauseCanonicalizer)
 *
 * evaluateFilter: runtime predicate matching
 *   strict mode: unknown ops → false (for cache invalidation, must be precise)
 *   loose mode: unknown ops → true (for optimistic UI, permissive)
 *   (from evaluateFilter.ts)
 *
 * objectMatchesWhere: recursive $and/$or/$not clause matching
 *   (from objectMatchesWhereClause.ts + objectSortaMatchesWhereClause)
 *
 * InvalidationGraph: per-type → per-query cascade revalidation
 *   when objectType changes → find all queries referencing it → revalidate sorted by priority
 *   (from Store.invalidateObject + getObjectTypesThatInvalidate)
 *
 * CacheKeyRegistry: trie-backed typed key management with refcount GC
 *   trailing-undefined normalization so (type, pk, undefined) === (type, pk)
 *   (from CacheKeys.ts)
 */

import { introspector } from '../debug/introspector'
const MODULE = 'canonicalize'

// ══════════════════════════════════════════════════════════════
// Trie — key-sequence store with branch pruning
// ══════════════════════════════════════════════════════════════

type TrieNode<T> = { children: Map<unknown, TrieNode<T>>; value: T | undefined }

export class Trie<T> {
  private _root: TrieNode<T> = { children: new Map(), value: undefined }
  private _make: ((keys: unknown[]) => T) | undefined
  constructor(make?: (keys: unknown[]) => T) { this._make = make }

  lookupArray(keys: unknown[]): T {
    let n = this._root
    for (const k of keys) {
      if (!n.children.has(k)) n.children.set(k, { children: new Map(), value: undefined })
      n = n.children.get(k)!
    }
    if (n.value === undefined && this._make) n.value = this._make(keys)
    return n.value!
  }

  peekArray(keys: unknown[]): T | undefined {
    let n: TrieNode<T> | undefined = this._root
    for (const k of keys) { n = n?.children.get(k); if (!n) return undefined }
    return n.value
  }

  removeArray(keys: unknown[]): T | undefined {
    const path: { parent: TrieNode<T>; key: unknown }[] = []
    let n: TrieNode<T> | undefined = this._root
    for (const k of keys) {
      if (!n) return undefined
      path.push({ parent: n, key: k }); n = n.children.get(k)
    }
    if (!n) return undefined
    const removed = n.value; n.value = undefined
    for (let i = path.length - 1; i >= 0; i--) {
      const { parent, key } = path[i]
      const child = parent.children.get(key)!
      if (child.children.size === 0 && child.value === undefined) parent.children.delete(key)
      else break
    }
    return removed
  }
}

// ══════════════════════════════════════════════════════════════
// deepEqual — structural comparison (OSDK uses fast-deep-equal)
// ══════════════════════════════════════════════════════════════

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null || b == null) return a === b
  if (typeof a !== typeof b) return false
  if (typeof a !== 'object') return false
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false
    return true
  }
  const ak = Object.keys(a as Record<string, unknown>).sort()
  const bk = Object.keys(b as Record<string, unknown>).sort()
  if (ak.length !== bk.length) return false
  for (let i = 0; i < ak.length; i++) {
    if (ak[i] !== bk[i]) return false
    if (!deepEqual((a as any)[ak[i]], (b as any)[bk[i]])) return false
  }
  return true
}

// ══════════════════════════════════════════════════════════════
// TrieCanonicalizer — sorted-key fingerprint → trie → WeakRef bucket → deepEqual
// from GenericCanonicalizer: collectSortedKeys() builds the fingerprint,
// trie.lookupArray() maps it to a bucket, deepEqual finds the match.
// MAX_FINGERPRINT_DEPTH prevents infinite recursion on cyclic/deep objects.
// ══════════════════════════════════════════════════════════════

const MAX_FINGERPRINT_DEPTH = 5

export type Canonical<T> = T & { readonly __canonical?: true }

function collectSortedKeys(obj: unknown, depth: number = 0): string[] {
  if (depth > MAX_FINGERPRINT_DEPTH || !obj || typeof obj !== 'object') return []
  if (Array.isArray(obj)) {
    const r = ['[]', String(obj.length)]
    for (const item of obj) r.push(...collectSortedKeys(item, depth + 1))
    return r
  }
  const rec = obj as Record<string, unknown>
  const r: string[] = []
  for (const key of Object.keys(rec).sort()) {
    r.push(key)
    r.push(...collectSortedKeys(rec[key], depth + 1))
  }
  return r
}

export class TrieCanonicalizer<T extends object = object> {
  // Level 1: identity cache (O(1) via WeakMap, like OSDK CachingCanonicalizer.inputCache)
  private _identity = new WeakMap<T, Canonical<T>>()
  // Level 2: structural dedup (trie fingerprint → bucket of WeakRef<Canonical>)
  private _trie = new Trie<object>()
  private _buckets = new Map<object, WeakRef<Canonical<T>>[]>()
  private _stats = { lookups: 0, identityHits: 0, structuralHits: 0, creates: 0, gcSweeps: 0 }

  canonicalize(input: T): Canonical<T>
  canonicalize(input: T | undefined): Canonical<T> | undefined
  canonicalize(input: T | undefined): Canonical<T> | undefined {
    if (!input) return undefined
    this._stats.lookups++

    // Fast path: same object reference → instant
    const cached = this._identity.get(input)
    if (cached) { this._stats.identityHits++; return cached }

    // Slow path: fingerprint → trie → bucket → deepEqual
    const fp = collectSortedKeys(input)
    const trieKey = this._trie.lookupArray(fp)
    const bucket = this._buckets.get(trieKey) ?? []
    if (!this._buckets.has(trieKey)) this._buckets.set(trieKey, bucket)

    for (let i = bucket.length - 1; i >= 0; i--) {
      const existing = bucket[i].deref()
      if (!existing) { bucket.splice(i, 1); this._stats.gcSweeps++; continue }
      if (deepEqual(existing, input)) {
        this._identity.set(input, existing)
        this._stats.structuralHits++
        return existing
      }
    }

    const canonical = input as Canonical<T>
    bucket.push(new WeakRef(canonical))
    this._identity.set(input, canonical)
    this._stats.creates++
    return canonical
  }

  debugStats() { return { ...this._stats } }
}

// ══════════════════════════════════════════════════════════════
// WhereCanonicalizer — predicate normalization
// from WhereClauseCanonicalizer: two-level cache (WeakMap fast + trie slow)
// key transformations: $and simplification, $eq shorthand, key sorting
// ══════════════════════════════════════════════════════════════

export interface WhereClause {
  $and?: WhereClause[]
  $or?: WhereClause[]
  $not?: WhereClause
  [field: string]: unknown
}

export class WhereCanonicalizer {
  private _cache = new WeakMap<WhereClause, Canonical<WhereClause>>()
  private _trie = new Trie<object>()
  private _existing = new Map<object, WeakRef<Canonical<WhereClause>>[]>()

  canonicalize(where: WhereClause): Canonical<WhereClause>
  canonicalize(where: WhereClause | undefined): Canonical<WhereClause> | undefined
  canonicalize(where: WhereClause | undefined): Canonical<WhereClause> | undefined {
    if (!where) return undefined
    if (this._cache.has(where)) return this._cache.get(where)!

    const keysSet = new Set<string>()
    const computed = this._toCanon(where, keysSet)
    const trieKey = this._trie.lookupArray(Array.from(keysSet).sort())
    const bucket = this._existing.get(trieKey) ?? []
    if (!this._existing.has(trieKey)) this._existing.set(trieKey, bucket)

    let canon: Canonical<WhereClause> | null = null
    for (let i = bucket.length - 1; i >= 0; i--) {
      const existing = bucket[i].deref()
      if (!existing) { bucket.splice(i, 1); continue }
      if (deepEqual(existing, computed)) { canon = existing; break }
    }
    if (!canon) { canon = computed; bucket.push(new WeakRef(computed)) }
    this._cache.set(where, canon)
    return canon
  }

  private _toCanon(where: WhereClause, keys: Set<string>): Canonical<WhereClause> {
    // $and simplifications (directly from OSDK WhereClauseCanonicalizer#toCanon)
    if ('$and' in where && Array.isArray(where.$and)) {
      if (where.$and.length === 0) return {} as Canonical<WhereClause>
      if (where.$and.length === 1) return this._toCanon(where.$and[0], keys)
    }
    return Object.fromEntries(
      Object.entries(where)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => {
          keys.add(k)
          if (k === '$and' || k === '$or') return [k, (v as WhereClause[]).map(x => this._toCanon(x, keys))]
          // $eq shorthand (from OSDK: if not $not and value has $eq, unwrap)
          if (k !== '$not' && typeof v === 'object' && v !== null && !Array.isArray(v) && '$eq' in (v as object))
            return [k, (v as any).$eq]
          return [k, v]
        })
    ) as Canonical<WhereClause>
  }
}

// ══════════════════════════════════════════════════════════════
// evaluateFilter — runtime predicate with strict/loose mode
// directly from OSDK evaluateFilter.ts
// strict=true: unknown ops → false (cache invalidation: be precise)
// strict=false: unknown ops → true (optimistic UI: be permissive)
// ══════════════════════════════════════════════════════════════

export function evaluateFilter(op: string, actual: unknown, expected: unknown, strict: boolean): boolean {
  switch (op) {
    case '$eq':  return actual === expected
    case '$ne':  return actual !== expected
    case '$gt':  return (actual as number) > (expected as number)
    case '$lt':  return (actual as number) < (expected as number)
    case '$gte': return (actual as number) >= (expected as number)
    case '$lte': return (actual as number) <= (expected as number)
    case '$in':  return Array.isArray(expected) && expected.includes(actual)
    case '$isNull': return actual == null
    case '$startsWith': return typeof actual === 'string' && actual.startsWith(expected as string)
    // OSDK pattern: complex ops → strict rejects, loose accepts
    case '$contains': case '$containsAllTerms': case '$containsAllTermsInOrder':
    case '$containsAnyTerm': case '$interval': case '$matchesRegex':
    case '$intersects': case '$within':
      return !strict
    default: return !strict
  }
}

// ══════════════════════════════════════════════════════════════
// objectMatchesWhere — recursive $and/$or/$not
// from objectSortaMatchesWhereClause in OSDK
// type guards is$and/is$or/is$not enforce single-key invariant
// ══════════════════════════════════════════════════════════════

export function objectMatchesWhere(obj: Record<string, unknown>, where: WhereClause, strict: boolean = true): boolean {
  if (deepEqual(where, {})) return true

  if ('$and' in where && Array.isArray(where.$and)) {
    return where.$and.every(w => objectMatchesWhere(obj, w, strict))
  }
  if ('$or' in where && Array.isArray(where.$or)) {
    return where.$or.some(w => objectMatchesWhere(obj, w, strict))
  }
  if ('$not' in where && where.$not) {
    return !objectMatchesWhere(obj, where.$not, strict)
  }

  return Object.entries(where).every(([key, filter]) => {
    if (key.startsWith('$')) return true // skip already-handled logical ops
    const actual = obj[key]
    // Predicate object: { field: { $gt: 5 } }
    if (typeof filter === 'object' && filter !== null && !Array.isArray(filter)) {
      const ops = Object.keys(filter as Record<string, unknown>)
      if (ops.length > 0 && ops[0].startsWith('$')) {
        const [op] = ops
        return evaluateFilter(op, actual, (filter as any)[op], strict)
      }
    }
    // Direct equality: { field: value }
    return actual === filter
  })
}

// ══════════════════════════════════════════════════════════════
// InvalidationGraph — per-objectType → per-query cascade
// from Store.invalidateObject: queries register which types they care about,
// invalidation fans out sorted by priority (cheap per-object first, expensive per-type second)
// ══════════════════════════════════════════════════════════════

export interface InvalidationTarget {
  queryId: string
  revalidate: () => Promise<void> | void
  objectTypes: Set<string>
  priority: number
}

export class InvalidationGraph {
  private _targets = new Map<string, InvalidationTarget>()
  private _typeIndex = new Map<string, Set<string>>()
  private _stats = { invalidations: 0, revalidations: 0 }

  register(target: InvalidationTarget): () => void {
    this._targets.set(target.queryId, target)
    for (const t of target.objectTypes) {
      if (!this._typeIndex.has(t)) this._typeIndex.set(t, new Set())
      this._typeIndex.get(t)!.add(target.queryId)
    }
    return () => {
      this._targets.delete(target.queryId)
      for (const t of target.objectTypes) this._typeIndex.get(t)?.delete(target.queryId)
    }
  }

  async invalidateByType(objectType: string): Promise<string[]> {
    this._stats.invalidations++
    const ids = this._typeIndex.get(objectType)
    if (!ids || ids.size === 0) return []
    const sorted = [...ids].map(id => this._targets.get(id)!).filter(Boolean).sort((a, b) => a.priority - b.priority)
    const results: string[] = []
    for (const t of sorted) {
      try { await t.revalidate(); results.push(t.queryId); this._stats.revalidations++ }
      catch { introspector.error(MODULE, `Revalidation failed: ${t.queryId}`) }
    }
    introspector.checkpoint(MODULE, 'invalidation_cascade', { objectType, affected: results.length })
    return results
  }

  getStats() { return { ...this._stats } }
}

// ══════════════════════════════════════════════════════════════
// CacheKeyRegistry — trie-backed typed keys with trailing-undefined trim
// from OSDK CacheKeys: normalize (type, pk, undefined) → (type, pk)
// ══════════════════════════════════════════════════════════════

export interface TypedCacheKey { type: string; args: unknown[] }

export class CacheKeyRegistry<K extends TypedCacheKey = TypedCacheKey> {
  private _trie: Trie<K>
  private _refs = new Map<K, number>()
  private _gc = new Map<K, number>()
  private _keepAlive: number
  private _onDestroy: ((key: K) => void) | undefined
  private _timer: ReturnType<typeof setInterval>

  constructor(opts: { keepAlive?: number; onDestroy?: (key: K) => void }) {
    this._keepAlive = opts.keepAlive ?? 60_000
    this._onDestroy = opts.onDestroy
    this._trie = new Trie(keys => ({ type: keys[0] as string, args: keys.slice(1) } as K))
    this._timer = setInterval(() => this._sweep(), 1000)
  }

  get(type: string, ...args: unknown[]): K {
    // Trailing undefined normalization (from OSDK CacheKeys.#normalizeArgs)
    const norm = [...args]
    while (norm.length > 0 && norm[norm.length - 1] === undefined) norm.pop()
    const key = this._trie.lookupArray([type, ...norm])
    if (!this._refs.has(key) && !this._gc.has(key)) this._gc.set(key, Date.now() + this._keepAlive)
    return key
  }

  peek(type: string, ...args: unknown[]): K | undefined {
    const norm = [...args]
    while (norm.length > 0 && norm[norm.length - 1] === undefined) norm.pop()
    return this._trie.peekArray([type, ...norm])
  }

  retain(key: K) { this._refs.set(key, (this._refs.get(key) ?? 0) + 1); this._gc.delete(key) }
  release(key: K) {
    const c = this._refs.get(key)
    if (!c) return
    if (c <= 1) { this._refs.delete(key); this._gc.set(key, Date.now() + this._keepAlive) }
    else this._refs.set(key, c - 1)
  }

  private _sweep() {
    const now = Date.now()
    for (const [key, death] of this._gc) {
      if (death < now) { this._gc.delete(key); this._trie.removeArray([key.type, ...key.args]); this._onDestroy?.(key) }
    }
  }

  dispose() { clearInterval(this._timer) }
  get size() { return this._refs.size + this._gc.size }
}
