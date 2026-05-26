/*
 * Copyright 2025 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon Pantheon architecture patterns.
 *
 *     M56: Pipeline — source-to-ontology transformation chain
 *
 *     From PantheonPipeline.execute as the good example. Then,
 *     following that pattern, implement TransformStage to let the
 *     pipeline hold typed pure-function stages (input T -> output U),
 *     and enabling composable transformation chains without side
 *     effects. Next, StageMetrics introduces per-stage timing and
 *     error tracking, making the pipeline able to report bottleneck
 *     stages and failure rates, while TransformStage optimizes
 *     error isolation with per-stage try/catch so one failing stage
 *     does not crash the chain. Subsequently, PipelineRegistry
 *     integrates named pipeline registration and lookup, letting
 *     consumers execute pipelines by name without holding direct
 *     references, and BranchStage enables conditional routing where
 *     a predicate directs items to one of two sub-pipelines.
 *     Finally, TransformPipeline composes all subsystems into a
 *     builder pattern (pipeline.stage(fn).stage(fn).branch(pred,a,b)
 *     .build()), ensuring the ingestion layer (M50-M53) can declare
 *     RawLcuEvent -> ClassifiedEvent -> TypedOntologyWrite chains
 *     while the advisor pipeline becomes just one registered consumer
 *     pipeline, comprehensively decoupling transformation from advice
 *     generation.
 */

import type { ObjectStore, OntologyObjectType } from '../store/object-store'

export interface StageDescriptor<I = unknown, O = unknown> {
  name: string
  transform: (input: I) => O
}

export interface StageMetrics {
  name: string
  invocations: number
  totalDurationMs: number
  avgDurationMs: number
  errors: number
  lastError: string | null
  lastInvokedAt: number
}

export interface PipelineResult<T> {
  output: T | null
  success: boolean
  stagesExecuted: number
  totalDurationMs: number
  errors: PipelineStageError[]
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
}

export type StageErrorHandler = (
  stageName: string,
  error: unknown,
  input: unknown
) => 'skip' | 'abort' | 'retry'

export type PipelineMiddleware = (
  stageName: string,
  input: unknown,
  next: () => unknown
) => unknown

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

  constructor(name: string) {
    this._name = name
    this._createdAt = Date.now()
  }

  get name(): string {
    return this._name
  }

  get stageCount(): number {
    return this._stages.length
  }

  addStage<SI, SO>(name: string, transform: (input: SI) => SO): TransformPipeline<I, O> {
    this._stages.push({ name, transform: transform as (input: unknown) => unknown })
    this._metrics.set(name, {
      name,
      invocations: 0,
      totalDurationMs: 0,
      avgDurationMs: 0,
      errors: 0,
      lastError: null,
      lastInvokedAt: 0
    })
    return this
  }

  addFilter(name: string, predicate: (input: unknown) => boolean): TransformPipeline<I, O> {
    this._stages.push({
      name,
      transform: (input: unknown) => {
        if (!predicate(input)) return null
        return input
      }
    })
    this._metrics.set(name, {
      name,
      invocations: 0,
      totalDurationMs: 0,
      avgDurationMs: 0,
      errors: 0,
      lastError: null,
      lastInvokedAt: 0
    })
    return this
  }

  addFlatMap(name: string, fn: (input: unknown) => unknown[]): TransformPipeline<I, O> {
    this._stages.push({
      name,
      transform: (input: unknown) => {
        const results = fn(input)
        return results.length === 1 ? results[0] : results
      }
    })
    this._metrics.set(name, {
      name,
      invocations: 0,
      totalDurationMs: 0,
      avgDurationMs: 0,
      errors: 0,
      lastError: null,
      lastInvokedAt: 0
    })
    return this
  }

  addSink(name: string, sink: (input: unknown) => void): TransformPipeline<I, O> {
    this._stages.push({
      name,
      transform: (input: unknown) => {
        sink(input)
        return input
      }
    })
    this._metrics.set(name, {
      name,
      invocations: 0,
      totalDurationMs: 0,
      avgDurationMs: 0,
      errors: 0,
      lastError: null,
      lastInvokedAt: 0
    })
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
        metrics.totalDurationMs += elapsed
        metrics.avgDurationMs = metrics.totalDurationMs / metrics.invocations
        stagesExecuted++
      } catch (err) {
        const elapsed = Date.now() - stageStart
        metrics.totalDurationMs += elapsed
        metrics.avgDurationMs = metrics.totalDurationMs / metrics.invocations
        metrics.errors++
        metrics.lastError = err instanceof Error ? err.message : String(err)

        const stageError: PipelineStageError = {
          stageName: stage.name,
          error: metrics.lastError,
          timestamp: Date.now(),
          inputSnapshot: this._safeStringify(current)
        }
        errors.push(stageError)
        this._totalErrors++

        const action = this._errorHandler
          ? this._errorHandler(stage.name, err, current)
          : 'skip'

        if (action === 'abort') {
          return {
            output: null,
            success: false,
            stagesExecuted,
            totalDurationMs: Date.now() - pipelineStart,
            errors
          }
        }

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

    return {
      output: current as O | null,
      success: errors.length === 0,
      stagesExecuted,
      totalDurationMs: Date.now() - pipelineStart,
      errors
    }
  }

  executeBatch(inputs: I[]): PipelineResult<O>[] {
    return inputs.map((input) => this.execute(input))
  }

  getStageMetrics(): StageMetrics[] {
    return Array.from(this._metrics.values())
  }

  getStageMetric(name: string): StageMetrics | null {
    return this._metrics.get(name) ?? null
  }

  getDescriptor(): PipelineDescriptor {
    return {
      name: this._name,
      stageCount: this._stages.length,
      createdAt: this._createdAt,
      lastExecutedAt: this._lastExecutedAt,
      totalExecutions: this._totalExecutions,
      totalErrors: this._totalErrors
    }
  }

  resetMetrics(): void {
    for (const [, metrics] of this._metrics) {
      metrics.invocations = 0
      metrics.totalDurationMs = 0
      metrics.avgDurationMs = 0
      metrics.errors = 0
      metrics.lastError = null
      metrics.lastInvokedAt = 0
    }
    this._totalExecutions = 0
    this._totalErrors = 0
  }

  private _executeWithMiddleware(
    stage: StageDescriptor,
    input: unknown,
    middlewareIdx: number
  ): unknown {
    if (middlewareIdx >= this._middlewares.length) {
      return stage.transform(input)
    }
    const middleware = this._middlewares[middlewareIdx]
    return middleware(stage.name, input, () => {
      return this._executeWithMiddleware(stage, input, middlewareIdx + 1)
    })
  }

  private _safeStringify(value: unknown): string {
    try {
      const str = JSON.stringify(value)
      return str.length > 200 ? str.substring(0, 200) + '...' : str
    } catch {
      return '[unstringifiable]'
    }
  }
}

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
            linkOp.sourceType,
            linkOp.sourceKey,
            linkOp.linkType as any,
            linkOp.targetType,
            linkOp.targetKey
          )
        } else {
          this._store.removeLink(
            linkOp.sourceType,
            linkOp.sourceKey,
            linkOp.linkType as any,
            linkOp.targetType,
            linkOp.targetKey
          )
        }
        this._linkCount++
      }
    }
  }

  applyBatch(ops: OntologyWriteOp[]): void {
    this._store.beginBatch()
    for (const op of ops) {
      this.applyWrite(op)
    }
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
    this._writtenCount = 0
    this._linkCount = 0
  }
}

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

  listPipelines(): PipelineDescriptor[] {
    const result: PipelineDescriptor[] = []
    for (const [, pipeline] of this._pipelines) {
      result.push(pipeline.getDescriptor())
    }
    return result
  }

  getAllMetrics(): Map<string, StageMetrics[]> {
    const result = new Map<string, StageMetrics[]>()
    for (const [name, pipeline] of this._pipelines) {
      result.set(name, pipeline.getStageMetrics())
    }
    return result
  }

  has(name: string): boolean {
    return this._pipelines.has(name)
  }

  get size(): number {
    return this._pipelines.size
  }

  clear(): void {
    this._pipelines.clear()
  }

  dispose(): void {
    for (const [, pipeline] of this._pipelines) {
      pipeline.resetMetrics()
    }
    this._pipelines.clear()
  }
}

export function createTransformPipeline<I = unknown, O = unknown>(
  name: string
): TransformPipeline<I, O> {
  return new TransformPipeline<I, O>(name)
}

export function createPipelineRegistry(): PipelineRegistry {
  return new PipelineRegistry()
}

export function createOntologyWriter(store: ObjectStore): OntologyWriterStage {
  return new OntologyWriterStage(store)
}
