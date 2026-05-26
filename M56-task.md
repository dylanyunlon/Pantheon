M56: Pipeline — Source-to-Ontology Transformation Chain
========================================================

Author: dylanyunlon <dogechat@163.com>
Milestone: M56 (Claude #56)
Depends-on: M1-M55

4 files changed, +580/-0 (2 new, 2 modified)

Part A: TransformPipeline — Declarative Typed Stage Chain
-----------------------------------------------------------

From PantheonPipeline.execute as the good example. Then, following
that pattern, implement TransformStage to let the pipeline hold typed
pure-function stages (input T -> output U), and enabling composable
transformation chains without side effects. Next, StageMetrics
introduces per-stage timing and error tracking, making the pipeline
able to report bottleneck stages and failure rates, while
TransformStage optimizes error isolation with per-stage try/catch so
one failing stage does not crash the chain. Subsequently,
PipelineRegistry integrates named pipeline registration and lookup,
letting consumers execute pipelines by name without holding direct
references, and OntologyWriterStage enables typed ontology writes
as a terminal sink stage that delegates to ObjectStore.write with
optional link operations. Finally, TransformPipeline composes all
subsystems into a builder pattern with addStage/addFilter/addFlatMap
/addSink, ensuring the ingestion layer can declare typed chains
while the advisor pipeline becomes just one registered consumer,
comprehensively decoupling transformation from advice generation.

Files Created (2 files, 518 lines)
-----------------------------------

1. src/shared/ontology/pipeline/transform-pipeline.ts (496 lines)
   - StageDescriptor<I,O>: { name, transform: (I) => O }
   - StageMetrics: per-stage invocations, totalDurationMs, avgDurationMs,
     errors, lastError, lastInvokedAt
   - PipelineResult<T>: { output, success, stagesExecuted, totalDurationMs,
     errors[] }
   - PipelineStageError: { stageName, error, timestamp, inputSnapshot }
   - PipelineDescriptor: { name, stageCount, createdAt, lastExecutedAt,
     totalExecutions, totalErrors }
   - StageErrorHandler: callback returning 'skip' | 'abort' | 'retry'
   - PipelineMiddleware: (stageName, input, next) => output for cross-cutting
     concerns (logging, tracing, validation)
   - TransformPipeline<I,O>: the main class.
     * addStage(name, fn): appends a transform stage
     * addFilter(name, predicate): appends a filter stage (returns null to drop)
     * addFlatMap(name, fn): appends a one-to-many expansion stage
     * addSink(name, fn): appends a side-effect stage (passes input through)
     * setErrorHandler(handler): configures per-stage error policy
     * addMiddleware(middleware): adds cross-cutting middleware
     * execute(input): runs the full stage chain with metrics collection.
       Null propagation: if any stage returns null, remaining stages skip.
       Error handling: per-stage try/catch, handler decides skip/abort/retry.
     * executeBatch(inputs): maps execute over an input array
     * getStageMetrics(): all stage timing/error data
     * getDescriptor(): pipeline metadata
     * resetMetrics(): zero all counters
   - OntologyWriteOp: { objectType, primaryKey, value, ttlMs?, linkOps? }
   - LinkOp: { action, sourceType, sourceKey, linkType, targetType, targetKey }
   - OntologyWriterStage: terminal sink that applies OntologyWriteOp to ObjectStore.
     * applyWrite(op): single write + optional link operations
     * applyBatch(ops): batched writes via ObjectStore.beginBatch/commitBatch
     * createSinkFn(): returns a function suitable for addSink()
   - PipelineRegistry: named pipeline collection.
     * register/unregister/get/has
     * execute(name, input): lookup + execute in one call
     * executeBatch(name, inputs): lookup + batch execute
     * listPipelines(): all pipeline descriptors
     * getAllMetrics(): all pipeline metrics keyed by name
   - Factory functions: createTransformPipeline, createPipelineRegistry,
     createOntologyWriter

2. src/shared/ontology/pipeline/index.ts (22 lines)
   Barrel export

Files Modified (2 files, +40/-0)
----------------------------------

3. src/shared/utils/engine.ts (+38)
   - Import PipelineRegistry, createPipelineRegistry, createTransformPipeline,
     createOntologyWriter and types from ontology/pipeline
   - Add _pipelineRegistry and _ontologyWriter fields, initialized in constructor
   - get pipelineRegistry: direct accessor
   - get ontologyWriter: direct accessor
   - registerPipeline(pipeline): registration shortcut
   - executePipeline(name, input): execution shortcut
   - listPipelines(): descriptor listing shortcut
   - getPipelineMetrics(name): per-pipeline stage metrics
   - clearCache(): added _pipelineRegistry.clear() + _ontologyWriter.resetStats()
   - dispose(): added _pipelineRegistry.dispose()

User-Angle Critique
---------------------

1. TransformPipeline uses null as the "drop" signal. If a filter stage returns
   null, all subsequent stages are skipped. This means legitimate null values
   cannot flow through the pipeline. For ontology data, all meaningful values
   are objects (never null), so this is safe. If a future stage needs to
   propagate null as a value, wrap it in { value: null } instead.

2. The error handler's 'retry' action retries the stage once. If the stage
   fails again, the error is counted but execution continues (skip behavior).
   There is no exponential backoff or multi-retry. For synchronous stages
   (all current use cases), retry is most useful for transient computation
   errors (rare). Async stages would need different retry semantics.

3. PipelineMiddleware wraps every stage. A logging middleware that serializes
   input/output adds overhead proportional to data size. For the ingestion
   pipeline processing ~1000 events per game, this is acceptable. Callers
   should keep middlewares lightweight in production.

4. executeBatch returns PipelineResult[] rather than a single aggregated
   result. Each input is processed independently. If one input fails, others
   still succeed. The caller must iterate results to check individual success.

System-Angle Critique
-----------------------

1. OntologyWriterStage.applyWrite uses ObjectStore.addLink with linkType
   cast to any. This is because LinkOp.linkType is string (to allow pipeline
   definitions without importing OntologyLinkType). The cast is safe because
   ObjectStore.addLink accepts the string at runtime; TypeScript's nominal
   check is the only thing bypassed.

2. The pipeline registry stores pipelines by name. If two pipelines share a
   name, the second registration overwrites the first. This is intentional:
   it allows pipeline hot-replacement (e.g., swapping a debug pipeline for
   production). Callers should use unique names.

3. _safeStringify truncates input snapshots to 200 characters in error
   records. This prevents memory bloat from large event payloads in the
   error log. The truncation may lose information needed for debugging;
   callers needing full payloads should add a middleware that logs them.

4. Middleware execution is recursive (middleware[0] calls middleware[1]
   calls ... calls stage.transform). With 2-3 middlewares (typical), the
   recursion depth is trivial. 100+ middlewares would be a design smell.
