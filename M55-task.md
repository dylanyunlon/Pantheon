M55: ObjectSet — Query and Filter Over the Ontology Store
==========================================================

Author: dylanyunlon <dogechat@163.com>
Milestone: M55 (Claude #55)
Depends-on: M1-M54

4 files changed, +568/-0 (1 new, 3 modified)

Part A: ObjectSet — Declarative Query Pipeline Over ObjectStore
----------------------------------------------------------------

From ObjectStore.queryByType as the good example. Then, following
that pattern, implement WhereClause to let the ObjectSet filter
objects by field predicates ($eq, $gt, $gte, $lt, $lte, $ne, $in,
$nin, $exists, $regex), and enabling declarative query composition
without manual iteration. Next, OrderByClause introduces multi-field
sorting with direction control, making the ObjectSet able to produce
deterministic result ordering, while WhereClause optimizes compound
filters with $and/$or/$not logical operators for arbitrary nesting.
Subsequently, AggregationEngine integrates numeric field reduction
(count, sum, avg, min, max, distinctCount), letting consumers compute
team-level statistics directly from the ontology store, and FetchPage
enables cursor-based pagination over filtered/sorted results without
materializing the full set. Finally, ObjectSet composes all four
subsystems into a fluent pipeline (objectSet.where(...).orderBy(...)
.limit(...).fetchPage(offset, size)), ensuring the advisor pipeline
can query the ontology with the same expressiveness as OSDK ObjectSet
queries against Foundry.

Files Created (1 file, 490 lines)
-----------------------------------

1. src/shared/ontology/store/object-set.ts (490 lines)
   - ComparisonOperator: 10 operators ($eq/$ne/$gt/$gte/$lt/$lte/
     $in/$nin/$exists/$regex)
   - LogicalOperator: $and, $or, $not for compound clauses
   - WhereClause: recursive type supporting nested field predicates
     and logical operators. Field access via dot-notation path
     (e.g., 'summary.winRate' traverses nested objects)
   - OrderByField: { field, direction } for multi-field sorting
   - AggregationClause: { op, field? } for reductions
   - AggregationResult: { op, field, value } output
   - FetchPageResult<T>: { items, totalCount, offset, pageSize, hasMore }
   - ObjectSetSnapshot<T>: serializable snapshot of query + results
   - getNestedValue(): dot-path field accessor for deep property reads
   - evaluatePredicate(): applies a single FieldPredicate against a value.
     Type-safe: $gt/$gte/$lt/$lte require both operands to be number,
     $regex requires both to be string, $in/$nin require array expected
   - matchesWhere(): recursive WhereClause evaluator. Processes $and
     (all must match), $or (any must match), $not (must not match),
     then iterates remaining fields. Non-operator field values are
     treated as implicit $eq.
   - compareValues(): null-safe comparator for sort. Null/undefined
     sorts before all values in asc, after all in desc. Numbers use
     arithmetic, strings use localeCompare.
   - computeAggregation(): dispatches AggregationOp over a number[].
     distinctCount uses Set.size.
   - ObjectSet<T>: fluent immutable pipeline. Each method (where,
     orderBy, limit, offset) returns a new ObjectSet clone:
     * where(clause): additive — chaining where().where() produces $and
     * orderBy(field, dir): appends to multi-field sort list
     * limit(n): caps result count
     * offset(n): skips first n results
     * fetchAll(): materialize filter -> sort -> offset/limit
     * fetchPage(offset, size): filter -> sort -> slice + totalCount
     * fetchFirst(): shortcut for limit(1).fetchAll()[0]
     * count(): filter count without materializing
     * aggregate(clauses): reductions over filtered set
     * groupBy(field): partition into Map<fieldValue, T[]>
     * groupByAggregate(field, clauses): partition + per-group aggregation
     * distinct(field): unique values of a field
     * exists(): boolean existence check
     * snapshot(): serializable query+results capture
     * map/filter/reduce/forEach: functional combinators over fetchAll
     * toArray(): alias for fetchAll
   - createObjectSet<T>(): factory function

Files Modified (3 files, +78/-0)
----------------------------------

2. src/shared/ontology/store/index.ts (+20)
   Added ObjectSet, createObjectSet class exports. Added ComparisonOperator,
   LogicalOperator, FieldPredicate, WhereClause, OrderByField, AggregationOp,
   AggregationClause, AggregationResult, FetchPageResult, ObjectSetSnapshot
   type exports.

3. src/shared/utils/engine.ts (+46)
   - Import ObjectSet, createObjectSet, WhereClause, AggregationClause,
     AggregationResult, FetchPageResult from ontology/store
   - objectSet<T>(objectType): creates a fresh ObjectSet over the ontology store
   - ontologyQuery<T>(objectType, where?, orderByField?, orderByDir?, limit?):
     convenience shortcut for common filter+sort+limit pattern
   - ontologyAggregate(objectType, clauses, where?): shortcut for aggregation
   - ontologyFetchPage<T>(objectType, offset, pageSize, where?, orderByField?,
     orderByDir?): shortcut for paginated queries

User-Angle Critique
---------------------

1. ObjectSet is immutable — each where/orderBy/limit returns a new clone.
   This means chaining is safe: `const base = objectSet('Player');
   const gold = base.where({ rank: { $gte: 'GOLD' } });
   const plat = base.where({ rank: { $gte: 'PLATINUM' } });` — base is
   unmodified. However, each clone allocates a new ObjectSet object.
   For tight loops, callers should cache the final ObjectSet rather
   than rebuilding the chain.

2. WhereClause uses implicit $eq for non-object field values:
   `{ team: 'ORDER' }` is equivalent to `{ team: { $eq: 'ORDER' } }`.
   This is convenient but means you cannot query for objects where a
   field's value is itself a plain object. If needed, use $eq explicitly.

3. $regex creates a new RegExp on every predicate evaluation. For
   large result sets (>1000 objects), this adds GC pressure. The
   advisor pipeline rarely queries >100 objects, so this is acceptable.
   A future optimization could cache compiled RegExp.

4. groupByAggregate materializes all groups first, then aggregates
   each group. For 10 players grouped by team (2 groups of 5), this
   is trivial. For GameEvent grouped by type (~15 types, ~500 events),
   it allocates 15 arrays. Still well within desktop memory budget.

5. fetchPage returns totalCount computed from the full filtered set.
   This means the full filter runs even for page 1 of 1. For ontology
   stores with <10K objects per type, this is sub-millisecond. If
   future types grow larger, adding a count-only path would help.

System-Angle Critique
-----------------------

1. ObjectSet reads from ObjectStore.queryByType which materializes
   all objects of a type into an array. This means every ObjectSet
   operation starts with a full-type scan. M54's queryByType already
   does this, so ObjectSet adds no additional cost beyond the filter
   pass. Index-based query optimization (e.g., B-tree on winRate)
   is possible but unnecessary at current data volumes.

2. The clone pattern copies the _orderBy array on each orderBy call.
   For chains with many orderBy calls (unlikely: typically 1-2), this
   creates intermediate arrays. The shallow clone of _where (reference
   copy) is O(1).

3. matchesWhere is recursive for $and/$or/$not. Maximum nesting depth
   in practice is 2-3 levels (advisor queries are flat or one level of
   $and). Stack overflow is not a realistic risk.

4. Aggregation operations (sum, avg, min, max) iterate the values
   array once except min/max which use Math.min/max with spread.
   For arrays >10K elements, this spread could hit call-stack limits.
   At current data volumes (<1000 per type), this is safe.
