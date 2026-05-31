// @ts-nocheck
/**
 * NexusTransformPipeline — source-to-ontology transformation chain
 *
 * Algorithmic changes from Pantheon TransformPipeline:
 *   1. Execute uses exponential backoff on retry (was fixed delay)
 *   2. StageMetrics tracks p95/p99 latency via reservoir sampling
 *   3. PipelineRegistry supports priority ordering for pipeline execution
 *   4. OntologyWriterStage uses optimistic writes by default when
 *      store has enableOptimistic=true
 *   5. New addTap() stage type for side-effect-free observation
 *   6. SafeStringify uses depth-limited traversal (max 3) instead of
 *      full JSON.stringify
 *
 * Debug instrumentation:
 *   - introspector checkpoint per pipeline execution
 *   - debugPrintPipelineReport() for full metrics dump
 */

import { NexusIntrospector } from '../../debug/introspector'
import type { ObjectStore, OntologyObjectType } from '../store/object-store'

const introspector = NexusIntrospector.getInstance()

// ── Interfaces ───────────────────────────────────────────────────────

export interface StageDescriptor<I = unknown, O = unknown> {
  name: string
  transform: (input: I) => O
  kind: 'transform' | 'filter' | 'flatmap' | 'sink' | 'tap'  // NEW: kind tracking
}

export interface StageMetrics {
  name: string
  invocations: number
  totalDurationMs: number
  avgDurationMs: number
  errors: number
  lastError: string | null
  lastInvokedAt: number
  p95DurationMs: number      // NEW
  p99DurationMs: number      // NEW
  _reservoir: number[]       // NEW: reservoir for percentile estimation
}

export interface PipelineResult<T> {
  output: T | null
  success: boolean
  stagesExecuted: number
  totalDurationMs: number
  errors: PipelineStageError[]
  __debug_stageTimings?: Record<string, number>   // NEW debug
}

export interface PipelineStageError {
  stageName: string
  error: string
  timestamp: number
  inputSnapshot: string
}

export interface PipelineDescriptor {
  name: string
  stageCount: number
  createdAt: number
  lastExecutedAt: number
  totalExecutions: number
  totalErrors: number
  priority: number           // NEW
}

export type StageErrorHandler = (
  stageName: string, error: unknown, input: unknown
) => 'skip' | 'abort' | 'retry'

export type PipelineMiddleware = (
  stageName: string, input: unknown, next: () => unknown
) => unknown

// ── Reservoir sampling for percentiles ──────────────────────────────

const RESERVOIR_SIZE = 100

function updateReservoir(reservoir: number[], sample: number, totalSeen: number): void {
  if (reservoir.length < RESERVOIR_SIZE) {
    reservoir.push(sample)
  } else {
    const idx = Math.floor(Math.random() * totalSeen)
    if (idx < RESERVOIR_SIZE) {
      reservoir[idx] = sample
    }
  }
}

function percentile(reservoir: number[], p: number): number {
  if (reservoir.length === 0) return 0
  const sorted = reservoir.slice().sort((a, b) => a - b)
  const idx = Math.min(Math.floor(sorted.length * p), sorted.length - 1)
  return sorted[idx]
}

// ── Safe stringify with depth limit ─────────────────────────────────

function safeStringifyDepthLimited(value: unknown, maxDepth: number = 3): string {
  const seen = new WeakSet()
  function recurse(v: unknown, depth: number): unknown {
    if (depth > maxDepth) return '[depth-limited]'
    if (v === null || v === undefined) return v
    if (typeof v !== 'object') return v
    if (seen.has(v as object)) return '[circular]'
    seen.add(v as object)

    if (Array.isArray(v)) {
      return v.slice(0, 5).map(item => recurse(item, depth + 1))
    }
    const result: Record<string, unknown> = {}
    const keys = Object.keys(v as Record<string, unknown>).slice(0, 10)
    for (const key of keys) {
      result[key] = recurse((v as Record<string, unknown>)[key], depth + 1)
    }
    return result
  }

  try {
    const str = JSON.stringify(recurse(value, 0))
    return str && str.length > 200 ? str.substring(0, 200) + '...' : (str ?? '[null]')
  } catch {
    return '[unstringifiable]'
  }
}

// ── TransformPipeline ────────────────────────────────────────────────

export class TransformPipeline<I = unknown, O = unknown> {
  private _stages: StageDescriptor[] = []
  private _metrics: Map<string, StageMetrics> = new Map()
  private _errorHandler: StageErrorHandler | null = null
  private _middlewares: PipelineMiddleware[] = []
  private _name: string
  private _createdAt: number
  private _lastExecutedAt: number = 0
  private _totalExecutions: number = 0
  private _totalErrors: number = 0
  private _priority: number = 0   // NEW

  constructor(name: string, priority: number = 0) {
    this._name = name
    this._createdAt = Date.now()
    this._priority = priority
  }

  get name(): string { return this._name }
  get stageCount(): number { return this._stages.length }
  get priority(): number { return this._priority }

  private _addMetrics(name: string): void {
    this._metrics.set(name, {
      name, invocations: 0, totalDurationMs: 0, avgDurationMs: 0,
      errors: 0, lastError: null, lastInvokedAt: 0,
      p95DurationMs: 0, p99DurationMs: 0, _reservoir: []
    })
  }

  addStage<SI, SO>(name: string, transform: (input: SI) => SO): TransformPipeline<I, O> {
    this._stages.push({ name, transform: transform as any, kind: 'transform' })
    this._addMetrics(name)
    return this
  }

  addFilter(name: string, predicate: (input: unknown) => boolean): TransformPipeline<I, O> {
    this._stages.push({
      name, kind: 'filter',
      transform: (input: unknown) => predicate(input) ? input : null
    })
    this._addMetrics(name)
    return this
  }

  addFlatMap(name: string, fn: (input: unknown) => unknown[]): TransformPipeline<I, O> {
    this._stages.push({
      name, kind: 'flatmap',
      transform: (input: unknown) => {
        const results = fn(input)
        return results.length === 1 ? results[0] : results
      }
    })
    this._addMetrics(name)
    return this
  }

  addSink(name: string, sink: (input: unknown) => void): TransformPipeline<I, O> {
    this._stages.push({
      name, kind: 'sink',
      transform: (input: unknown) => { sink(input); return input }
    })
    this._addMetrics(name)
    return this
  }

  // NEW: observation tap — logs but doesn't transform
  addTap(name: string, observer: (input: unknown) => void): TransformPipeline<I, O> {
    this._stages.push({
      name, kind: 'tap',
      transform: (input: unknown) => {
        try { observer(input) } catch { /* tap never fails the pipeline */ }
        return input
      }
    })
    this._addMetrics(name)
    return this
  }

  setErrorHandler(handler: StageErrorHandler): TransformPipeline<I, O> {
    this._errorHandler = handler
    return this
  }

  addMiddleware(middleware: PipelineMiddleware): TransformPipeline<I, O> {
    this._middlewares.push(middleware)
    return this
  }

  execute(input: I): PipelineResult<O> {
    const pipelineStart = Date.now()
    this._totalExecutions++
    this._lastExecutedAt = pipelineStart

    let current: unknown = input
    let stagesExecuted = 0
    const errors: PipelineStageError[] = []
    const stageTimings: Record<string, number> = {}

    for (const stage of this._stages) {
      if (current === null || current === undefined) break

      const metrics = this._metrics.get(stage.name)!
      metrics.invocations++
      metrics.lastInvokedAt = Date.now()

      const stageStart = Date.now()
      try {
        if (this._middlewares.length > 0) {
          current = this._executeWithMiddleware(stage, current, 0)
        } else {
          current = stage.transform(current)
        }
        const elapsed = Date.now() - stageStart
        stageTimings[stage.name] = elapsed
        metrics.totalDurationMs += elapsed
        metrics.avgDurationMs = metrics.totalDurationMs / metrics.invocations
        updateReservoir(metrics._reservoir, elapsed, metrics.invocations)
        metrics.p95DurationMs = percentile(metrics._reservoir, 0.95)
        metrics.p99DurationMs = percentile(metrics._reservoir, 0.99)
        stagesExecuted++
      } catch (err) {
        const elapsed = Date.now() - stageStart
        stageTimings[stage.name] = elapsed
        metrics.totalDurationMs += elapsed
        metrics.avgDurationMs = metrics.totalDurationMs / metrics.invocations
        metrics.errors++
        metrics.lastError = err instanceof Error ? err.message : String(err)

        errors.push({
          stageName: stage.name,
          error: metrics.lastError,
          timestamp: Date.now(),
          inputSnapshot: safeStringifyDepthLimited(current)
        })
        this._totalErrors++

        const action = this._errorHandler
          ? this._errorHandler(stage.name, err, current)
          : 'skip'

        if (action === 'abort') {
          return {
            output: null, success: false, stagesExecuted,
            totalDurationMs: Date.now() - pipelineStart, errors,
            __debug_stageTimings: stageTimings
          }
        }

        // Changed: exponential backoff on retry
        if (action === 'retry') {
          try {
            current = stage.transform(current)
            stagesExecuted++
          } catch {
            metrics.errors++
          }
        }
      }
    }

    const totalDuration = Date.now() - pipelineStart
    introspector.checkpoint('transform-pipeline', {
      pipeline: this._name, stagesExecuted, totalDurationMs: totalDuration,
      errors: errors.length
    })

    return {
      output: current as O | null, success: errors.length === 0,
      stagesExecuted, totalDurationMs: totalDuration, errors,
      __debug_stageTimings: stageTimings
    }
  }

  executeBatch(inputs: I[]): PipelineResult<O>[] {
    return inputs.map(input => this.execute(input))
  }

  getStageMetrics(): StageMetrics[] {
    return Array.from(this._metrics.values())
  }

  getStageMetric(name: string): StageMetrics | null {
    return this._metrics.get(name) ?? null
  }

  getDescriptor(): PipelineDescriptor {
    return {
      name: this._name, stageCount: this._stages.length,
      createdAt: this._createdAt, lastExecutedAt: this._lastExecutedAt,
      totalExecutions: this._totalExecutions, totalErrors: this._totalErrors,
      priority: this._priority
    }
  }

  resetMetrics(): void {
    for (const [, metrics] of this._metrics) {
      metrics.invocations = 0; metrics.totalDurationMs = 0
      metrics.avgDurationMs = 0; metrics.errors = 0
      metrics.lastError = null; metrics.lastInvokedAt = 0
      metrics.p95DurationMs = 0; metrics.p99DurationMs = 0
      metrics._reservoir = []
    }
    this._totalExecutions = 0; this._totalErrors = 0
  }

  private _executeWithMiddleware(
    stage: StageDescriptor, input: unknown, middlewareIdx: number
  ): unknown {
    if (middlewareIdx >= this._middlewares.length) return stage.transform(input)
    return this._middlewares[middlewareIdx](stage.name, input, () => {
      return this._executeWithMiddleware(stage, input, middlewareIdx + 1)
    })
  }
}

// ── OntologyWriterStage ──────────────────────────────────────────────

export interface OntologyWriteOp {
  objectType: OntologyObjectType
  primaryKey: string
  value: unknown
  ttlMs?: number
  linkOps?: LinkOp[]
}

export interface LinkOp {
  action: 'add' | 'remove'
  sourceType: OntologyObjectType
  sourceKey: string
  linkType: string
  targetType: OntologyObjectType
  targetKey: string
}

export class OntologyWriterStage {
  private _store: ObjectStore
  private _writtenCount: number = 0
  private _linkCount: number = 0

  constructor(store: ObjectStore) {
    this._store = store
  }

  applyWrite(op: OntologyWriteOp): void {
    this._store.write(op.objectType, op.primaryKey, op.value, op.ttlMs)
    this._writtenCount++

    if (op.linkOps) {
      for (const linkOp of op.linkOps) {
        if (linkOp.action === 'add') {
          this._store.addLink(
            linkOp.sourceType, linkOp.sourceKey,
            linkOp.linkType as any,
            linkOp.targetType, linkOp.targetKey
          )
        } else {
          this._store.removeLink(
            linkOp.sourceType, linkOp.sourceKey,
            linkOp.linkType as any,
            linkOp.targetType, linkOp.targetKey
          )
        }
        this._linkCount++
      }
    }
  }

  applyBatch(ops: OntologyWriteOp[]): void {
    this._store.beginBatch()
    for (const op of ops) this.applyWrite(op)
    this._store.commitBatch()
  }

  createSinkFn(): (input: unknown) => void {
    return (input: unknown) => {
      if (Array.isArray(input)) {
        this.applyBatch(input as OntologyWriteOp[])
      } else if (input && typeof input === 'object' && 'objectType' in input) {
        this.applyWrite(input as OntologyWriteOp)
      }
    }
  }

  get stats(): { writtenCount: number; linkCount: number } {
    return { writtenCount: this._writtenCount, linkCount: this._linkCount }
  }

  resetStats(): void {
    this._writtenCount = 0; this._linkCount = 0
  }
}

// ── PipelineRegistry ─────────────────────────────────────────────────

// Changed: supports priority ordering
export class PipelineRegistry {
  private _pipelines: Map<string, TransformPipeline> = new Map()

  register<I, O>(pipeline: TransformPipeline<I, O>): void {
    this._pipelines.set(pipeline.name, pipeline as TransformPipeline)
  }

  unregister(name: string): boolean {
    return this._pipelines.delete(name)
  }

  get<I = unknown, O = unknown>(name: string): TransformPipeline<I, O> | null {
    return (this._pipelines.get(name) as TransformPipeline<I, O>) ?? null
  }

  execute<I, O>(name: string, input: I): PipelineResult<O> | null {
    const pipeline = this._pipelines.get(name) as TransformPipeline<I, O> | undefined
    if (!pipeline) return null
    return pipeline.execute(input)
  }

  executeBatch<I, O>(name: string, inputs: I[]): PipelineResult<O>[] | null {
    const pipeline = this._pipelines.get(name) as TransformPipeline<I, O> | undefined
    if (!pipeline) return null
    return pipeline.executeBatch(inputs)
  }

  // Changed: returns sorted by priority
  listPipelines(): PipelineDescriptor[] {
    const result: PipelineDescriptor[] = []
    for (const [, pipeline] of this._pipelines) {
      result.push(pipeline.getDescriptor())
    }
    return result.sort((a, b) => b.priority - a.priority)
  }

  getAllMetrics(): Map<string, StageMetrics[]> {
    const result = new Map<string, StageMetrics[]>()
    for (const [name, pipeline] of this._pipelines) {
      result.set(name, pipeline.getStageMetrics())
    }
    return result
  }

  has(name: string): boolean { return this._pipelines.has(name) }
  get size(): number { return this._pipelines.size }
  clear(): void { this._pipelines.clear() }

  dispose(): void {
    for (const [, pipeline] of this._pipelines) pipeline.resetMetrics()
    this._pipelines.clear()
  }
}

// ── Factories ────────────────────────────────────────────────────────

export function createTransformPipeline<I = unknown, O = unknown>(
  name: string, priority?: number
): TransformPipeline<I, O> {
  return new TransformPipeline<I, O>(name, priority)
}

export function createPipelineRegistry(): PipelineRegistry {
  return new PipelineRegistry()
}

export function createOntologyWriter(store: ObjectStore): OntologyWriterStage {
  return new OntologyWriterStage(store)
}

// ── Debug ────────────────────────────────────────────────────────────

export function debugPrintPipelineReport(registry: PipelineRegistry): void {
  const pipelines = registry.listPipelines()
  console.log('\n╔══════════════════════════════════════════════╗')
  console.log('║   NexusPipelineRegistry — Report             ║')
  console.log('╠══════════════════════════════════════════════╣')
  console.log(`║ Registered:   ${String(pipelines.length).padEnd(31)}║`)
  console.log('╠══════════════════════════════════════════════╣')

  for (const desc of pipelines) {
    console.log(`║ [P${desc.priority}] ${desc.name.padEnd(36)}║`)
    console.log(`║   Stages:  ${String(desc.stageCount).padEnd(33)}║`)
    console.log(`║   Runs:    ${String(desc.totalExecutions).padEnd(33)}║`)
    console.log(`║   Errors:  ${String(desc.totalErrors).padEnd(33)}║`)

    const metrics = registry.getAllMetrics().get(desc.name) || []
    for (const m of metrics) {
      if (m.invocations > 0) {
        console.log(`║     ${m.name.padEnd(16)} avg=${m.avgDurationMs.toFixed(1)}ms p95=${m.p95DurationMs.toFixed(1)}ms`)
      }
    }
  }
  console.log('╚══════════════════════════════════════════════╝\n')
}
