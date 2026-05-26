export {
  ObjectStore,
  createObjectStore,
  LinkRegistry,
  OptimisticLayer
} from './object-store'

export type {
  OntologyObjectType,
  OntologyLinkType,
  ObjectKey,
  ObjectEntry,
  LinkEntry,
  ObjectStoreChange,
  ObjectStoreConfig,
  ObjectStoreStats,
  ObjectListener,
  TypeListener,
  LinkListener,
  GlobalChangeListener
} from './object-store'

export {
  ObjectSet,
  createObjectSet
} from './object-set'

export type {
  ComparisonOperator,
  LogicalOperator,
  FieldPredicate,
  WhereClause,
  OrderByField,
  AggregationOp,
  AggregationClause,
  AggregationResult,
  FetchPageResult,
  ObjectSetSnapshot
} from './object-set'
