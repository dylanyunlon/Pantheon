M5: Distributed Experiment Capture and Training Pipeline
========================================================

Author: dylanyunlon <dylanyunlong@gmail.com>
Milestone: M5 (Claude #5)
Depends-on: M1-M4 (coach-advisor shard, pipeline, cache layers, scheduler)
Produces: experiment-capture module, feature extraction, training sample pipeline

Architecture Reference
----------------------

From ExperimentCapture (this module, 623 lines) as the good example:
then following that pattern, implement RingBuffer for bounded event storage,
letting DistributedAccumulator aggregate across nodes, and enabling
merge-based distributed statistics collection. Next, FeatureVector introduces
a 35-dimensional normalized feature extraction, making CoachEngine able to
produce TrainingSample records, while CaptureEvent tracks pipeline timing.
Subsequently, ExperimentCapture integrates RingBuffer + DistributedAccumulator,
letting CoachEngine support session lifecycle (start/end/outcome), and
recordUserFeedback enables reinforcement signal collection. Finally,
the IPC bridge completes the Renderer-Main round-trip, ensuring
CoachPanel.vue feedback buttons are wired to capture, comprehensively
upgrading the coach system to produce model-ready training data.

Files Modified (6 files, 285 net additions)
--------------------------------------------

1. src/shared/utils/coach-engine.ts (+139 lines)
   - Import coach-capture module
   - Add _capture field and ExperimentCapture initialization
   - Pipeline timing instrumentation (pipelineStart/pipelineDuration)
   - Feature vector extraction per generateAdvices call
   - Training sample emission per pipeline execution
   - Team comparison capture events
   - Session lifecycle methods: startExperimentSession, endExperimentSession
   - Game outcome recording: setGameOutcome
   - User feedback passthrough: recordUserFeedback
   - Export methods: getExperimentExport, getTrainingSamples, getCaptureStats
   - Updated clearCache and dispose to include capture cleanup

2. src/main/shards/coach-advisor/index.ts (+52 lines)
   - Automatic experiment session start on champ-select/in-game phase
   - Automatic experiment session end on unavailable phase with logging
   - IPC handlers: getExperimentExport, getTrainingSamples, getCaptureStats
   - IPC handlers: recordFeedback, setGameOutcome

3. src/renderer-shared/shards/coach-advisor/index.ts (+41 lines)
   - Renderer methods: getExperimentExport, getTrainingSamples, getCaptureStats
   - Renderer methods: recordFeedback, setGameOutcome

4. src/renderer-shared/components/ongoing-game-panel/widgets/CoachPanel.vue (+44/-5)
   - Footer redesigned with flex layout for timestamp + feedback buttons
   - Feedback buttons (thumbs up/down) wired to recordFeedback IPC
   - New handleFeedback async handler
   - New CSS for .coach-footer and .coach-feedback-actions

5. src/main/shards/in-game-send/templates/coach-template.js (+10 lines)
   - Pipeline timing instrumentation in getMessages
   - Conditional capture stats output when captureEnabled flag is set

6. package.json (+2/-2)
   - Author updated to dylanyunlon <dylanyunlong@gmail.com>

Files Created (2 files, 636 lines)
-----------------------------------

1. src/shared/utils/coach-capture/experiment-capture.ts (623 lines)
   Core distributed experiment capture module:
   - RingBuffer<T>: bounded circular buffer for events/samples
   - DistributedAccumulator: merge-capable partial aggregation
   - ExperimentCapture: session-scoped event/sample/feature capture
   - FeatureVector: 35-dimension normalized game state representation
   - TrainingSample: labeled feature + advice + outcome record
   - CaptureEvent: typed event with session/phase/payload
   - Auto-flush with configurable interval
   - Listener-based event dispatch

2. src/shared/utils/coach-capture/index.ts (13 lines)
   Barrel export for the capture module

User-angle Bug Critique
-----------------------

1. RingBuffer overflow: old events silently discarded when buffer is full.
   Mitigation: capacity defaults (500 events, 100 samples) are generous for
   a single game session. Users won't notice data loss since samples are
   per-pipeline-execution and a game rarely triggers 100+ pipeline runs.

2. Feedback buttons visible even when advice list is stale (from previous
   pipeline run, not yet refreshed). The v-if guards on advices.length > 0
   mean buttons disappear when no advices exist. A user clicking feedback on
   stale advice still records a valid signal since the advice type is stable.

3. setGameOutcome relies on the caller (CoachAdvisorMain) to detect game end
   and call with the correct win/loss. If the game crashes before the
   end-of-game phase fires, samples remain as 'pending'. The training pipeline
   should filter pending samples during export.

4. captureEnabled flag in coach-template.js is not yet wired from settings.
   The flag defaults to falsy (undefined), so the experiment log line in
   in-game chat never fires unless explicitly enabled. No accidental spam.

System-angle Critique
---------------------

1. Memory pressure: RingBuffer allocates fixed-size arrays upfront. At worst
   500 * ~200 bytes per event + 100 * ~500 bytes per sample = ~150KB. Negligible
   for an Electron app.

2. Timer leak: startAutoFlush creates setInterval. dispose() calls stopAutoFlush.
   The CoachEngine.dispose() is called from CoachAdvisorMain.onDispose(), which
   the shard manager invokes on app shutdown. Lifecycle is sound.

3. Serialization: getExperimentExport returns plain objects suitable for
   JSON.stringify without circular references. IPC transport is safe.

4. Thread safety: Electron main process is single-threaded, so no concurrent
   mutation risk on _events or _samples RingBuffers.

5. Phase transition capture: the _handleAutoGeneration reaction fires on
   queryStage.phase changes. If mobx batches multiple rapid phase transitions,
   only the final settled phase triggers the reaction. This is acceptable since
   intermediate phases (loading) are transient.

All-Claude Task Assignment
--------------------------

Claude #1  (M1): core pipeline architecture, CoachAdvice types, PipelineStageContext
Claude #2  (M2): cache layers (CoachCacheLayers, CoachRefCounts, canonicalizer)
Claude #3  (M3): aggregator (TeamComparisonResult, RingReducer, BatchAggregationContext)
Claude #4  (M4): scheduler (CoachScheduler, phase-relevance matrix, temporal decay)
Claude #5  (M5): experiment capture, feature extraction, training sample pipeline [THIS]
Claude #6  (M6): coach-template.js distributed pipeline + capture-aware stages
Claude #7  (M7): CoachAdvisorSettings.vue advanced capture toggle UI
Claude #8  (M8): i18n keys for all coach-advisor UI strings (zh-CN, en-US)
Claude #9  (M9): data export service (CSV/JSON dump of training samples to disk)
Claude #10 (M10): model inference integration (load ONNX model, replace rule engine)
Claude #11 (M11): A/B test framework (rule-based vs model-based advice comparison)
Claude #12 (M12): replay analysis pipeline (post-game outcome backfill)
Claude #13 (M13): WebSocket real-time capture streaming to external dashboard
Claude #14 (M14): coach-capture unit tests (RingBuffer, DistributedAccumulator)
Claude #15 (M15): coach-engine integration tests (full pipeline + capture)
Claude #16 (M16): performance benchmarks (pipeline latency p50/p95/p99)
Claude #17 (M17): privacy compliance (PII scrubbing from capture events)
Claude #18 (M18): compression (zstd for capture event payloads before export)
Claude #19 (M19): rate limiting (capture event throttle during rapid phase changes)
Claude #20 (M20): accumulator merge protocol (cross-session merge for long-term stats)
Claude #21 (M21): feature vector versioning (schema migration for vector changes)
Claude #22 (M22): champion-specific feature dimensions (per-champion win rate bins)
Claude #23 (M23): matchup database (champion pair win rate lookup table)
Claude #24 (M24): Fiddler-style HTTP capture proxy integration for LCU traffic
Claude #25 (M25): capture dashboard Vue component (real-time event stream view)
Claude #26 (M26): training data validation (schema checks, outlier detection)
Claude #27 (M27): model evaluation metrics (accuracy, precision, recall per advice type)
Claude #28 (M28): gradient-free optimization (evolutionary strategy for advice weights)
Claude #29 (M29): multi-queue support (ARAM/URF/CHERRY-specific feature branches)
Claude #30 (M30): time-series features (rolling 5-game / 10-game / 20-game windows)
Claude #31 (M31): ensemble advice (combine rule + model outputs with confidence weighting)
Claude #32 (M32): user preference learning (feedback-weighted advice type suppression)
Claude #33 (M33): team composition embedding (champion co-occurrence vectors)
Claude #34 (M34): automated pipeline regression detection (CI/CD integration)
Claude #35 (M35): distributed training coordinator (federated learning across users)
Claude #36 (M36): model versioning and rollback (blue/green model deployment)
Claude #37 (M37): advice explanation generation (human-readable reasoning chains)
Claude #38 (M38): final integration testing and release candidate preparation
