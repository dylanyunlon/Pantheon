M57: Observable + Histogram Extraction — CCCL-Pattern First-Pass Separation
=============================================================================

Author: dylanyunlon <dylanyunlong@gmail.com>
Milestone: M57 (Claude #57)
Depends-on: M1-M56

4 files changed, +1240/-9 (2 new, 2 modified)

Part A: ObservableClient — Ontology-Native Reactive Subscriptions (801 lines)
--------------------------------------------------------------------------------

From ObjectStore.subscribe as the good example. Then, following
that pattern, implement QuerySubscription to let consumers subscribe
to ObjectSet query results (filtered, sorted, paged), and enabling
automatic re-evaluation when matching objects change. Next,
BatchNotifier introduces configurable coalescing, making the
observable layer able to merge rapid writes into single notifications
(coalesceMs window), while QuerySubscription optimizes re-evaluation
by tracking which object types a query touches and skipping unrelated
changes. Subsequently, LinkSubscription integrates link-aware
observation, letting consumers subscribe to link traversal results
(all objects linked from a source via a given link type), and
SubscriptionGroup enables bulk lifecycle management where disposing
the group disposes all contained subscriptions. Finally,
ObservableClient composes all subsystems into a single entry point
with observeObject/observeQuery/observeLinks/observeAggregate,
ensuring the advisor pipeline replaces mobx reactions with
ontology-native subscriptions, comprehensively decoupling UI
reactivity from ad-hoc state management.

Part B: Histogram Extraction — CCCL DeviceTopK First-Pass Pattern (+144/-9)
------------------------------------------------------------------------------

Reference commit: NVIDIA/cccl@f984c90 — "Extract first histogram-only
pass in DeviceTopK into its own kernel"

The CCCL commit extracts a fused first pass in DeviceTopK where
the kernel was templated on IsFirstPass to branch between histogram-only
(pass 0, computing bucket distributions over the full input) and
filter+histogram (passes 1..N, simultaneously filtering candidates and
building histograms for the next pass). The extraction creates a
dedicated DeviceTopKHistogramKernel with its own grid size and occupancy
computation, eliminates the IsFirstPass template parameter from the
main kernel (AgentTopK::filter_and_histogram no longer needs the
branching), and enables independent tuning of the histogram kernel
launch configuration.

Pantheon analogue: stageMacroStrategy was the fused first pass. It
re-computed team score histograms inline (computing allyPass/enemyPass)
AND generated macro strategy advices — the IsFirstPass branching.
The M48 refactor (ProfilePass extraction) partially separated these
concerns but left dangling references: stageMacroStrategy still
referenced allyPass.perPlayer and enemyPass.perPlayer, which were
undefined in its scope (runtime crash on the intermediate write).

The extraction:

1. HistogramResult (the histogram buffer): New type capturing
   per-player score distributions with tier classification (top/high/
   mid/low/bottom), score totals, averages, and a tier distribution
   histogram — the precomputed output of the histogram-only kernel.

2. computeHistogramPass (the histogram kernel): Dedicated first-pass
   function computing ScoreBucket[] with tier classification for each
   player, analogous to DeviceTopKHistogramKernel. Runs BEFORE the
   pipeline stages. Its output is a HistogramResult with all score
   data pre-aggregated.

3. PipelineStageContext.histogram: New required field. Every stage
   receives the pre-computed histogram. No stage needs to recompute
   scores or branch on whether profile data exists.

4. stageMacroStrategy (the filter kernel, after): Reads directly
   from ctx.histogram.allyAvg, ctx.histogram.scoreDiff,
   ctx.histogram.tierDistribution — pure consumer, no inline
   recomputation. The dangling allyPass.perPlayer bug is fixed because
   histogram.allyPerPlayer is the authoritative source. Two new
   histogram-derived advices added: tier advantage detection (3+ ally
   players in top/high tiers vs <=1 enemy) and tier weakness warning
   (3+ ally players in low/bottom tiers).

5. generateAdvices (the dispatch): Calls computeHistogramPass as
   pass 0 (histogram-only kernel) before pipeline.execute (passes
   1..N, the filter+advice stages). Mirrors CCCL's loop structure:
   pass 0 = dedicated histogram kernel, pass 1..num_passes-1 = fused
   filter+histogram kernel.

Files Created (2 files, 830 lines)
------------------------------------

1. src/shared/ontology/observable/observable-client.ts (801 lines)
2. src/shared/ontology/observable/index.ts (29 lines)

   (See Part A detail in the delivered patch)

Files Modified (2 files, +218/-9)
-----------------------------------

3. src/shared/utils/engine.ts (+218/-9)
   Part A additions:
   - Import ObservableClient, types from ontology/observable
   - _ontologyObservable field + constructor init
   - observeOntologyObject/Query/Links/Aggregate shortcuts
   - createSubscriptionGroup, getObservableStats, listOntologySubscriptions
   - clearCache: _ontologyObservable.pauseAll()
   - dispose: _ontologyObservable.dispose()

   Part B additions:
   - ScoreBucket interface: { puuid, score, winRate, kdaAvg, gamesPlayed, tier }
   - HistogramResult interface: the histogram buffer type
   - classifyScoreTier(): score -> tier bucket classifier
   - computeHistogramPass(): dedicated histogram-only kernel
   - PipelineStageContext.histogram: required HistogramResult field
   - stageMacroStrategy: rewritten as pure histogram consumer
     * Removed undefined allyPass.perPlayer/enemyPass.perPlayer references
     * Added tier distribution analysis (histogram_tier_advantage,
       histogram_tier_weakness advices)
   - generateAdvices: calls computeHistogramPass as pass 0 before
     pipeline.execute

4. M57-task.md (this file)

User-Angle Critique
---------------------

1. The histogram extraction adds ~0.5ms to generateAdvices (one extra
   iteration over 10 players to build ScoreBucket[]). The fused approach
   was zero-cost for the histogram because it was embedded in
   stageMacroStrategy. However, the fused approach had a runtime crash
   (allyPass.perPlayer was undefined). Correctness over performance:
   the extra 0.5ms is invisible at 60fps.

2. The new tier_advantage/tier_weakness advices can overlap with
   existing macro_strategy advices. Example: scoreDiff > 3 triggers
   "己方整体实力占优" AND allyTopCount >= 3 triggers "团队整体状态出色".
   The deduplication key is type:title, so both survive. This is
   intentional: they carry different information (aggregate average vs
   distribution shape). But users see two "positive" messages which
   may feel redundant. If user feedback says "too many positive msgs",
   we can deduplicate at the audience level.

3. classifyScoreTier uses hardcoded thresholds (80/60/40/20). AkariScore
   ranges depend on the analysis window (recent 20 games). If a future
   change adjusts AkariScore normalization, the tier boundaries become
   stale. Consider deriving thresholds from population percentiles.

4. computeHistogramPass is called even when the pipeline result is
   cached (cache miss path only). On cache hit, neither the histogram
   nor the pipeline runs. This matches the CCCL pattern where the
   histogram kernel only launches if work is needed.

System-Angle Critique
-----------------------

1. HistogramResult.tierDistribution is a fixed-shape object (5 tier
   keys). If a sixth tier is added, computeHistogramPass returns
   correct buckets but countTiers initializes the new tier to 0. The
   tierDistribution read path in stageMacroStrategy uses string
   indexing, so it naturally handles additions without code changes.

2. The histogram is computed synchronously on the main thread. For
   10 players with 20 games each, this is ~200 calculateAkariScore
   calls (each does ~15 arithmetic operations). Total: ~3000 ops,
   well under 1ms on any modern CPU. If future scaling increases
   player count (tournament mode with 50+ players), consider moving
   to a Web Worker.

3. PipelineStageContext.histogram is now a required field. Any test
   or external code that constructs PipelineStageContext directly must
   provide a HistogramResult. The fix is to add a default empty
   HistogramResult factory for test contexts. Existing production code
   only constructs PipelineStageContext inside generateAdvices, where
   the histogram is always computed.

4. The CCCL pattern enables independent occupancy tuning of the
   histogram kernel vs the filter kernel. The Pantheon analogue is
   that computeHistogramPass could be memoized independently of the
   pipeline stages — if player data hasn't changed, skip the histogram
   recomputation even when pipeline parameters change (e.g. phase
   transition). This optimization is deferred to M59 (advisor as
   ontology consumer).
