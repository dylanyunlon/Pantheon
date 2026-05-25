import type { CoachAdvice, CoachAdviceType, CoachAdvicePriority } from './coach-engine'
import type { GamePhase } from './coach-scheduler'
import type { MatchHistoryGamesAnalysisAll } from './analysis'
import type { RankedStats } from '@shared/types/league-client/ranked'

export namespace Logger {
  export type LogFn = (...args: unknown[]) => void
}

export interface Logger {
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
  debug(...args: unknown[]): void
  trace?(...args: unknown[]): void
  fatal?(...args: unknown[]): void
  child(meta: Record<string, unknown>, extra?: Record<string, unknown>): Logger
  level?: string
}

export interface PageResult<T> {
  data: T[]
  nextPageToken?: string
  totalCount?: number
}

export type PageSize = number
export type PageToken = string

export interface ObjectTypeDefinition {
  type: 'object' | 'interface' | string
  apiName: string
  displayName: string
  properties: Record<string, PropertyDefinition>
  primaryKey: string
  primaryKeyApiName?: string
  primaryKeyType?: PrimaryKeyTypes
  links?: Record<string, LinkDefinition>
  interfaceMap?: Record<string, Record<string, string>>
}

export interface PropertyDefinition {
  apiName: string
  dataType: string
  nullable: boolean
  displayName?: string
  type?: string
  multiplicity?: boolean
  readonly?: boolean
}

export interface InterfaceMetadata {
  type: 'interface' | 'object'
  apiName: string
  properties: Record<string, PropertyDefinition>
  links?: Record<string, { targetType: string; targetTypeApiName: string; multiplicity: boolean }>
  implementedBy?: ReadonlyArray<string>
  primaryKeyApiName?: string
}

export interface ObjectMetadata extends ObjectTypeDefinition {
  links: Record<string, LinkDefinition>
}

export interface LinkDefinition {
  apiName: string
  targetType: string
  cardinality: 'ONE' | 'MANY'
}

export interface ActionDefinition<_T = any> {
  apiName: string
  parameters: Record<string, ParameterDefinition>
  __DefinitionMetadata?: unknown
  version?: string | number
  isFixedVersion?: boolean
  signatures?: unknown[]
  unsanitizedApiName?: string
}

export interface ParameterDefinition {
  dataType: string
  required: boolean
}

export interface ActionEditResponse {
  type?: 'edits' | 'largeScaleEdits'
  edits: Array<{ objectType: string; primaryKey: string; action: 'ADD' | 'MODIFY' | 'DELETE' }>
  addedObjects?: Array<{ objectType: string; primaryKey: string }>
  modifiedObjects?: Array<{ objectType: string; primaryKey: string }>
  deletedObjects?: Array<{ objectType: string; primaryKey: string }>
  addedLinks?: Array<{ linkType: string; sourcePrimaryKey: string; targetPrimaryKey: string }>
  deletedLinks?: Array<{ linkType: string; sourcePrimaryKey: string; targetPrimaryKey: string }>
  deletedLinksCount?: number
  deletedObjectsCount?: number
  editedPiiFieldTypes?: string[]
}

export type ActionValidationResponse = {
  valid: boolean
  errors: Array<{ message: string }>
}

export interface QueryDefinition<_T = any> {
  apiName: string
  parameters: Record<string, ParameterDefinition>
  output: QueryDataTypeDefinition
  version?: string | number
  isFixedVersion?: boolean
}

export interface CompileTimeMetadata<T = unknown> {
  type: string
  definition: T
  properties: Record<string, PropertyDefinition>
  links: Record<string, { targetType: string; targetTypeApiName?: string; multiplicity?: boolean; __OsdkLinkTargetType?: unknown }>
  props?: Record<string, unknown>
  strictProps?: Record<string, unknown>
  linksType?: unknown
  signature?: unknown
  parameters?: Record<string, ParameterDefinition>
  output?: QueryDataTypeDefinition
}


export interface CoachRecordBase {
  $objectType: string
  $primaryKey: string
  $apiName: string
}

export type PropertyKeys<T> = keyof T & string

export type WirePropertyTypes = string | number | boolean | null

export type WhereClause<_Q extends ObjectOrInterfaceDefinition = any, _RDPs = {}> = {
  $and?: WhereClause[]
  $or?: WhereClause[]
  $not?: WhereClause
  [field: string]: unknown
}

export type PossibleWhereClauseFilters =
  | '$eq' | '$ne' | '$gt' | '$gte' | '$lt' | '$lte'
  | '$in' | '$contains' | '$isNull'
  | '$startsWith' | '$containsAllTerms' | '$containsAllTermsInOrder'
  | '$containsAnyTerm' | '$interval' | '$matchesRegex'
  | '$intersects' | '$within'

export interface AggregationClause<_T = unknown> {
  field: string
  operation: 'sum' | 'avg' | 'min' | 'max' | 'count'
}

export interface GroupByClause {
  field: string
  type: 'exact' | 'range'
}

export interface GroupByRange {
  startValue: number
  endValue: number
}

export type AllGroupByValues = string | number | boolean

export interface AggregateObjectsResponseV2 {
  data: Array<{ group: Record<string, unknown>; metrics: Record<string, number> }>
}

export type AggregationV2 = AggregationClause

export interface IntervalRule {
  field: string
  interval: number
  unit: string
  $match?: unknown
  $prefixOnLastTerm?: boolean
  $fuzzy?: boolean
  $exactMatch?: string
  $phrase?: string
  $wildcardMatch?: string
  $regex?: string
  [key: string]: unknown
}

export type SearchJsonQueryV2 = WhereClause

export interface ObjectSet {
  type: string
  objectType?: string
  where?: WhereClause
  objectSets?: ObjectSet[]
  objectSet?: ObjectSet
  link?: string
  interfaceLink?: string
  interfaceType?: string
  entityType?: string
  pipelineSet?: ObjectSet
  derivedProperties?: Record<string, unknown>
  objectSetRid?: string
  reference?: unknown
  piiFieldType?: string
  [key: string]: unknown
}

export type WireObjectSet = ObjectSet

export interface MinimalObjectSet {
  type: string
  objectType: string
}

export interface GeoFilterOptions {
  type: 'bbox' | 'polygon' | 'intersects' | 'within'
  coordinates: number[][]
}

export interface Attachment {
  rid: string
  filename: string
  sizeBytes: number
  mediaType: string
}

export type AttachmentUpload = {
  filename: string
  data: Blob | ArrayBuffer
  mediaType?: string
}

export interface Media {
  path: string
  mediaType: string
}

export interface MediaMetadata {
  path: string
  sizeBytes: number
  mediaType: string
  updatedAt: string
}

export interface MediaReference {
  mediaSetRid: string
  path: string
}

export type MediaPropertyLocation = { mediaSetRid: string; path: string }

export type MediaUpload = {
  path: string
  data: Blob | ArrayBuffer
  mediaType?: string
}

export interface Transformation {
  type: 'resize' | 'crop' | 'rotate'
  params: Record<string, number>
}

export interface DerivedProperty {
  apiName: string
  expression: string
  resultType: string
}

export namespace DerivedProperty {
  export type Definition<_Q = unknown, _V = unknown> = DerivedPropertyDefinition
  export type Clause<_Q = unknown> = Record<string, DerivedPropertyDefinition>
  export type Creator<_Q = unknown, _V = unknown> = () => DerivedPropertyDefinition
}

export interface DerivedPropertyDefinition extends DerivedProperty {
  objectTypes: string[]
  type?: string
  property?: DerivedPropertyDefinition
  properties?: DerivedPropertyDefinition[]
  left?: DerivedPropertyDefinition
  right?: DerivedPropertyDefinition
  objectSet?: ObjectSet
  operation?: { type: string; selectedPropertyApiName?: string }
}

export type DataValue = string | number | boolean | null | DataValue[] | { [key: string]: DataValue | undefined; key?: DataValue; value?: DataValue; groups?: DataValue[] }

export type DatetimeLocalizedFormatType = 'short' | 'medium' | 'long' | 'full'

export interface DistanceUnitMapping {
  unit: string
  factor: number
}

export interface DurationMapping {
  unit: string
  factor: number
}

export interface PropertyValueFormattingRule {
  type: 'number' | 'date' | 'boolean' | 'string'
  format?: string
  locale?: string
}

export interface PropertyBooleanFormattingRule {
  trueLabel: string
  falseLabel: string
}

export type PropertyTypeReferenceOrStringConstant = string

export interface PropertySecurities {
  [property: string]: PropertySecurity
}

export interface PropertySecurity {
  redacted: boolean
  securityMarkings: string[]
}

export type ObjectOrInterfaceDefinition = ObjectTypeDefinition | InterfaceDefinition

export class CoachApiError extends Error {
  statusCode: number
  errorName: string
  constructor(message: string, statusCode: number = 500, errorName: string = 'COACH_ERROR') {
    super(message)
    this.name = 'CoachApiError'
    this.statusCode = statusCode
    this.errorName = errorName
  }
}

export const dylanyunlonApiError = CoachApiError

export function createFetchHeaderMutator(
  headers: Record<string, string>
): (existingHeaders: Record<string, string>) => Record<string, string> {
  return (existing) => ({ ...existing, ...headers })
}

export class Trie<V> {
  private _root = new Map<string, { value?: V; children: Map<string, any> }>()

  lookup(...keys: string[]): V | undefined {
    let node: any = this._root
    for (const key of keys) {
      node = node?.get?.(key)?.children
      if (!node) return undefined
    }
    return node?.value
  }

  lookupArray(keys: readonly string[]): V | undefined {
    return this.lookup(...keys)
  }
}

export type ValidateActionResponseV2 = ActionValidationResponse

export type ActionMetadata = ActionDefinition & { displayName?: string }
export namespace ActionMetadata {
  export type Parameters = Record<string, { dataType: DataType; required?: boolean }>
  export type DataType = { type: string }
}

export const Actions: Record<string, any> = {
  applyAction: async (..._args: unknown[]) => ({} as ActionEditResponse),
  validateAction: async (..._args: unknown[]) => ({} as ActionValidationResponse),
}

export const Attachments: Record<string, any> = {
  upload: async (_client: unknown, _upload: AttachmentUpload, ..._args: unknown[]) => ({} as Attachment),
}

export const Functions: Record<string, any> = {
  applyFunction: async (_client: unknown, _fn: unknown, _params: unknown, ..._args: unknown[]) => ({} as unknown),
  streamingExecute: async (_client: unknown, _fn: unknown, _params: unknown, ..._args: unknown[]) => ({} as any),
}

export const GameStateObjectSets = {
  create: (_client: unknown, _type: string) => ({} as ObjectSet)
}

export const Queries: Record<string, any> = {
  execute: async (..._args: unknown[]) => ({} as unknown),
  executeStreaming: async (..._args: unknown[]) => ({} as any),
}

export const MediaSets: Record<string, any> = {
  upload: async (..._args: unknown[]) => ({}),
  getUrl: (..._args: unknown[]) => '',
  uploadMedia: async (..._args: unknown[]) => ({}),
  transform: async (..._args: unknown[]) => ({}),
  transformAndWait: async (..._args: unknown[]) => ({}),
  getStatus: async (..._args: unknown[]) => ({}),
  getResult: async (..._args: unknown[]) => ({}),
}





export type PrimaryKeyTypes = string | number

export interface QueryDataTypeDefinition {
  type: string
  subType?: string
  objectTypeApiName?: string
  nullable?: boolean
  object?: string
  interface?: string
  pipelineSet?: string
  set?: QueryDataTypeDefinition
  array?: QueryDataTypeDefinition
  keyType?: QueryDataTypeDefinition
  valueType?: QueryDataTypeDefinition
  struct?: Record<string, QueryDataTypeDefinition>
}

export interface TimeRange {
  startTime: string
  endTime: string
}

export interface TimeSeriesQuery {
  range?: TimeRange
  type: string
}

export interface TimeseriesDurationMapping {
  unit: string
  value: number
}
export const TimeseriesDurationMapping: Record<string, string> = {
  YEARS: 'YEARS', MONTHS: 'MONTHS', WEEKS: 'WEEKS', DAYS: 'DAYS',
  HOURS: 'HOURS', MINUTES: 'MINUTES', SECONDS: 'SECONDS', MILLISECONDS: 'MILLISECONDS',
}

export interface TransformOptions {
  transformations: Transformation[]
  outputFormat?: string
  pollIntervalMs?: number
  pollTimeoutMs?: number
}

export const USER_AGENT_HEADER = 'X-Coach-User-Agent'

export interface GameStateObjectV2 {
  __apiName: string
  __primaryKey: string
  __rid?: string
  [key: string]: unknown
}


export interface InterfaceDefinition {
  type: 'interface'
  apiName: string
  properties: Record<string, PropertyDefinition>
  links?: Record<string, { targetType: string; targetTypeApiName: string; multiplicity: boolean }>
  implementedBy?: ReadonlyArray<string>
  primaryKeyApiName?: string
  interfaceMap?: Record<string, Record<string, string>>
}

export type PiiFieldTypeDefinition = ObjectOrInterfaceDefinition
export type PrivacyConfig = { enabled: boolean; rules: Record<string, unknown> }

export type AsyncIterArgs<Q extends ObjectOrInterfaceDefinition = ObjectOrInterfaceDefinition, _L = unknown, _R = unknown, _A = unknown, _S = unknown, _T = unknown, _U = unknown, _O = unknown> = {
  $pageSize?: number
  $select?: PropertyKeys<Q>[]
}

export type Augments = Record<string, unknown>

export type FetchPageResult<T, _L = unknown, _R = unknown, _S = unknown, _E = {}, _T = unknown, _O = unknown> = PageResult<T>

export type LinkedType<Q extends ObjectOrInterfaceDefinition, _L extends string = string> = ObjectOrInterfaceDefinition & { __source: Q }

export type LinkNames<Q extends ObjectOrInterfaceDefinition> = string & { __linkOf: Q }

export type LinkTypeApiNamesFor<Q extends ObjectOrInterfaceDefinition> = string & { __linkTypeOf: Q }

export type MinimalDirectedObjectLinkInstance = {
  sourceObjectApiName: string
  sourcePrimaryKey: string
  targetObjectApiName: string
  targetPrimaryKey: string
  linkTypeApiName: string
}

export type NullabilityAdherence = 'strict' | 'loose'

export namespace NullabilityAdherence {
  export const Default: NullabilityAdherence = 'strict'
}

export namespace ObjectSetArgs {
  export type OrderByOptions<_L = unknown> = Record<string, 'asc' | 'desc'>
}

export type ObjectSetArgs<Q extends ObjectOrInterfaceDefinition = ObjectOrInterfaceDefinition> = {
  $pageSize?: number
  $select?: PropertyKeys<Q>[]
  $where?: WhereClause
}

export type ObjectSetSubscription = {
  unsubscribe(): void
}

export interface ObjectSetSubscription {
  id: string
  updates?: unknown[]
  responses?: unknown[]
}
export namespace ObjectSetSubscription {
  export type Listener<_Q = unknown, _P = unknown, _R = unknown> = {
    onChange?(objects: unknown[]): void
    onOutOfDate?(): void
    onError?(error: unknown): void
    onSuccessfulSubscription?(): void
  }
}

export type Result<T> = { type: 'ok'; value: T } | { type: 'err'; error: unknown }

export type SelectArg<Q extends ObjectOrInterfaceDefinition = ObjectOrInterfaceDefinition, _L = any, _R = any, _A = any> = PropertyKeys<Q>[]

export type SingleOsdkResult<Q extends ObjectOrInterfaceDefinition = ObjectOrInterfaceDefinition, _L = unknown, _R = unknown, _S = unknown, _E = {}, _T = unknown, _O = unknown> = Coach.Instance<Q> | undefined

export type PropertyApiName<Q extends ObjectOrInterfaceDefinition = ObjectOrInterfaceDefinition> = PropertyKeys<Q>

export type FetchLinksPageResult<T = unknown, _L = unknown> = PageResult<T> & { sourceApiName: string }

export type ObjectIdentifiers<Q extends ObjectOrInterfaceDefinition = ObjectOrInterfaceDefinition> = {
  readonly $apiName: Q['apiName']
  readonly $primaryKey: PrimaryKeyType<Q>
}

export type LoadObjectSetLinksResponseV2 = {
  data: MinimalDirectedObjectLinkInstance[]
  nextPageToken?: string
}

export type ObjectSetStreamSubscribeRequest = {
  objectSetRid: string
  objectTypes: string[]
}

export type ObjectSetStreamSubscribeRequests = ObjectSetStreamSubscribeRequest[]

export type ObjectSetSubscribeResponses = {
  subscriptionId: string
}

export type ObjectSetUpdates = {
  type: 'objectAdded' | 'objectModified' | 'objectRemoved'
  objectType: string
  primaryKey: string
  properties?: Record<string, unknown>
}

export type ObjectState = {
  objectType: string
  primaryKey: string
  properties: Record<string, unknown>
}

export type RefreshPipelineSet = WirePipelineSet & { refresh: boolean }

export type StreamMessage =
  | { type: 'subscribeResponses'; data: ObjectSetSubscribeResponses }
  | { type: 'objectSetUpdates'; data: ObjectSetUpdates }
  | { type: 'refreshObjectSet'; data: RefreshPipelineSet }
  | { type: 'subscriptionClosed'; data: SubscriptionClosed }

export type SubscriptionClosed = {
  subscriptionId: string
  reason: string
}

export interface DataValueClientToWire {
  attachment: string | AttachmentUpload | Blob & { readonly name: string }
  boolean: boolean
  byte: number
  datetime: string
  date: string
  decimal: string | number
  float: number
  double: number
  integer: number
  long: string | number
  marking: string
  null: null
  short: number
  string: string
  timestamp: string
  set: Set<any>
  mediaReference: MediaReference | unknown
  twoDimensionalAggregation: { key: AllowedBucketKeyTypes; value: AllowedBucketTypes }[]
  threeDimensionalAggregation: { key: AllowedBucketKeyTypes; groups: { key: AllowedBucketKeyTypes; value: AllowedBucketTypes }[] }[]
  struct: Record<string, any>
  objectType: string
  geohash: unknown
  geoshape: unknown
  [key: string]: unknown
}
export interface DataValueWireToClient {
  attachment: Attachment
  boolean: boolean
  byte: number
  datetime: string
  date: string
  decimal: string
  float: number
  double: number
  integer: number
  long: string
  marking: string
  null: null
  short: number
  string: string
  timestamp: string
  mediaReference: MediaReference
  twoDimensionalAggregation: { key: AllowedBucketKeyTypes; value: AllowedBucketTypes }[]
  threeDimensionalAggregation: { key: AllowedBucketKeyTypes; groups: { key: AllowedBucketKeyTypes; value: AllowedBucketTypes }[] }[]
  struct: Record<string, any>
  set: Set<any>
  objectType: string
  geohash: unknown
  geoshape: unknown
  [key: string]: unknown
}

export type InterfaceQueryDataType<_T = unknown> = QueryDataTypeDefinition & { interface: string }
export type ObjectQueryDataType<_T = unknown> = QueryDataTypeDefinition & { object: string }
export type ObjectSetQueryDataType<_T = unknown> = QueryDataTypeDefinition & { objectSet: string }

export type QueryParam<T = unknown> = T

export namespace QueryParam {
  export type ObjectType<_T = unknown> = { $objectType: string; $primaryKey: string | number }
  export type InterfaceType<_T = unknown> = { $objectType: string; $primaryKey: string | number }
  export type ObjectSetType<_T = unknown> = ObjectSet
  export type PrimitiveType<_T = unknown> = string | number | boolean | null
}
export type QueryResult<T = unknown> = T

export namespace QueryResult {
  export type ObjectType<_T = unknown> = Coach.Instance
  export type ObjectSetType<_T = unknown> = ObjectSet
  export type PrimitiveType<_T = unknown> = string | number | boolean | null
}

export type AllowedBucketKeyTypes = string | number | boolean
export type AllowedBucketTypes = string | number | boolean | Date

export type QueryMetadata = {
  apiName: string
  displayName?: string
  description?: string
  parameters: Record<string, ParameterDefinition>
  output: QueryDataTypeDefinition
}

export type QueryParameterDefinition<_T = any> = ParameterDefinition

export class MediaTransformationFailedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MediaTransformationFailedError'
  }
}

export class MediaTransformationTimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MediaTransformationTimeoutError'
  }
}

export type ObjectSpecifier<Q extends ObjectOrInterfaceDefinition = ObjectOrInterfaceDefinition> = string & {
  readonly __objectSpecifier?: Q
}

export type ActionParam<T = unknown> = T

export namespace ActionParam {
  export type ObjectType<_T = unknown> = { $objectType: string; $primaryKey: string | number }
  export type InterfaceType<_T = unknown> = { $objectType: string; $primaryKey: string | number; __isInterface: true }
  export type ObjectSetType<_T = unknown> = ObjectSet
  export type PrimitiveType<_T = unknown> = string | number | boolean | null
}

export type PrimaryKeyType<Q extends ObjectOrInterfaceDefinition = ObjectOrInterfaceDefinition> = string | number

export type CoachBase<Q extends ObjectOrInterfaceDefinition = ObjectOrInterfaceDefinition> = ObjectIdentifiers<Q> & {
  readonly $objectType: string
  readonly $title?: string
}

export type PipelineSet<Q extends ObjectOrInterfaceDefinition = ObjectOrInterfaceDefinition, _RDPs = {}> = ObjectSet & {
  readonly __objectType?: Q
  aggregate(...args: unknown[]): Promise<unknown>
  fetchPage(args?: unknown): Promise<PageResult<Coach.Instance<Q>>>
  fetchPageWithErrors(args?: unknown): Promise<Result<PageResult<Coach.Instance<Q>>>>
  fetchOne(pk: PrimaryKeyType<Q>): Promise<Coach.Instance<Q>>
  fetchOneWithErrors(pk: PrimaryKeyType<Q>): Promise<Result<Coach.Instance<Q>>>
  where(clause: WhereClause | unknown): PipelineSet<Q>
  union(other: PipelineSet<Q>): PipelineSet<Q>
  intersect(...others: PipelineSet<Q>[]): PipelineSet<Q>
  subtract(other: PipelineSet<Q>): PipelineSet<Q>
  pivotTo(linkName: string): PipelineSet<any>
  withProperties(rdp: unknown): PipelineSet<Q>
  subscribe(handlers: { onChange?(objects: unknown[]): void; onOutOfDate?(): void; onError?(err: unknown): void; onSuccessfulSubscription?(): void }): { close(): void }
  applyAction?(args: unknown, opts?: unknown): Promise<unknown>
}

export type MinimalPipelineSet<Q extends ObjectOrInterfaceDefinition = ObjectOrInterfaceDefinition> = PipelineSet<Q>

export type WirePipelineSet = ObjectSet

export namespace Coach {
  export type Instance<
    Q extends ObjectOrInterfaceDefinition = ObjectOrInterfaceDefinition,
    _N = never,
    _P extends string = string,
    _E = {}
  > = CoachRecordBase & {
    readonly $objectType: string
    readonly $primaryKey: string | number
    readonly $apiName: string
    $as(apiName: string): Coach.Instance<Q>
    [key: string]: unknown
    [key: symbol]: unknown
  }
}

export type MediaReferenceProperties = {
  getMediaMetadata(client: unknown, ref: MediaReference): Promise<MediaMetadata>
  getMediaContent(client: unknown, ref: MediaReference): Promise<Blob>
}

export const MediaReferenceProperties: Record<string, any> = {
  async getMediaMetadata(_client: unknown, _ref: MediaReference): Promise<MediaMetadata> {
    return { path: '', sizeBytes: 0, mediaType: '', updatedAt: '' }
  },
  async getMediaContent(_client: unknown, _ref: MediaReference): Promise<Blob> {
    return new Blob([] as any[])
  },
  async getMediaContentUrl(..._args: unknown[]): Promise<string> { return '' },
}

export type TimeSeriesPropertiesV2 = Record<string, unknown>
export type TimeSeriesValueBankProperties = Record<string, unknown>
export type CoreMediaReference = MediaReference


export type ActionReturnTypeForOptions<_T = unknown, _O = unknown> = unknown
export type AggregateObjectsRequestV2 = any
export type AggregateOpts<_Q = any> = Record<string, AggregationClause>
export type AggregateOptsThatErrorsAndDisallowsOrderingWithMultipleGroupBy = any
export type AggregationGroupByV2 = any
export type AggregationRangeV2 = any


export type AggregationsResults<_Q = any, _A = any> = { data: unknown[]; excludedItems?: number }
export type AndWhereClause = any
export type ApplyActionOptions = any
export type ApplyBatchActionOptions = any
export type AudioEncoding = any
export type AudioOperation = any
export type AudioToTextOperation = any
export type Augment = any
export type BatchApplyActionResponseV2 = any

export type DatetimeFormat = any
export type DatetimeLocalizedFormat = any
export type DatetimeTimezone = any
export type DicomToImageOperation = any
export type DocumentTextExtractionConfig = any
export type DocumentToDocumentOperation = any
export type DocumentToImageOperation = any
export type DocumentToTextOperation = any
export type EmailToAttachmentOperation = any
export type EmailToTextOperation = any
export type FetchPageArgs<_T = any, _L = any, _R = any, _A = any, _S = any, _U = any> = { $pageSize?: number; $nextPageToken?: string; $select?: string[]; $orderBy?: Record<string, string>; $loadPropertySecurityMetadata?: boolean }
export type GeotimeSeriesProperty = any
export type ImageOperation = any
export type ImageSpec = any
export type ImageToDocumentOperation = any
export type ImageToEmbeddingOperation = any
export type ImageToTextOperation = any
export type InterfacePropertyLocalPropertyImplementation = any
export type InterfaceToObjectTypeMappings = any
export type InterfaceToObjectTypeMappingsV2 = any
export type InterfaceTypeApiName = any
export type LayoutAwareExtractionParameters = any
export type LlmSpec = any
export type LoadObjectSetV2MultipleObjectTypesRequest = any
export type MediaTransformation = any
export type NotWhereClause = any
export type NumberFormatAffix = any
export type NumberFormatCurrency = any
export type NumberFormatCustomUnit = any
export type NumberFormatOptions = any
export type NumberFormatRatio = any
export type NumberFormatScale = any
export type NumberFormatStandardUnit = any
export type NumberRatioType = any
export type NumberScaleType = any
export type OcrLanguageOrScript = any
export type OcrOutputFormat = any
export type OcrParameters = any
export type OrWhereClause = any
export type PageRange = any
export type PropertyIdentifier = any
export type PropertyNumberFormattingRuleType = any
export type ReferenceValue = any
export type SearchOrderByV2 = any
export type SecuredPropertyValue = any
export type SimplePropertyDef = any

export type SpreadsheetToTextOperation = any
export type SyncApplyActionResponseV2 = any
export type TimeSeriesPoint<_T = unknown> = { time: string; value: _T }
export type TimeSeriesProperty<_T = unknown> = { getFirstPoint(): Promise<TimeSeriesPoint<_T> | undefined>; getLastPoint(): Promise<TimeSeriesPoint<_T> | undefined>; getAllPoints(query?: unknown): Promise<TimeSeriesPoint<_T>[]> }
export type TranscribeOutputFormat = any
export type VideoOperation = any
export type VideoToArchiveOperation = any
export type VideoToAudioOperation = any
export type VideoToImageOperation = any
export type VideoToTextOperation = any
export type VlmPreprocessingConfig = any


export type ObserveObjectOptions<_T = unknown> = { apiName: string; pk: PiiKeyType; $select?: string[]; $includeAllBaseObjectProperties?: boolean; $loadPropertySecurityMetadata?: boolean }
export type ObserveScrubFieldOptions<_T = unknown, _RDPs = {}> = { apiName: string; where?: WhereClause; $select?: string[]; $orderBy?: OrderBy; pageSize?: number; dedupeInterval?: number; autoFetchMore?: number | boolean; $loadPropertySecurityMetadata?: boolean; $includeAllBaseObjectProperties?: boolean; withProperties?: Record<string, unknown> }
export type ObserveObjectSetOptions<_T = unknown, _RDPs = {}> = ObserveScrubFieldOptions<_T, _RDPs>
export type ObserveLinks = { objectApiName: string; linkApiName: string }
export namespace ObserveLinks {
  export type Options<_T = unknown, _L extends string = string> = { objectApiName: string; linkApiName: string; objects: unknown; $select?: string[]; $orderBy?: OrderBy; pageSize?: number; dedupeInterval?: number; autoFetchMore?: number | boolean; $loadPropertySecurityMetadata?: boolean; $includeAllBaseObjectProperties?: boolean }
  export type CallbackArgs<_T = unknown> = { data: unknown[]; status: string; hasMore: boolean; fetchMore: () => Promise<void> }
}
export type Observer<T = unknown> = { onChange(value: T): void; onError?(error: unknown): void }
export type Status = 'init' | 'loading' | 'loaded' | 'error'
export type CommonObserveOptions = { dedupeInterval?: number }
export type CacheEntry = { value: unknown; status: string; lastUpdated?: number }
export type CacheSnapshot = { entries: () => MapIterator<[unknown, CacheEntry]>; size: number }

export type ObjectUpdate<_O = unknown, _P extends string = string> = {
  object: Coach.Instance
  state: 'ADDED_OR_UPDATED' | 'REMOVED'
}

export type ObserveAggregationOptions<_T = unknown, _A = unknown> = { apiName: string; aggregate: unknown; where?: WhereClause; withProperties?: Record<string, unknown> }
export type ObserveAggregationOptionsWithPipelineSet<_T = unknown, _A = unknown> = ObserveAggregationOptions<_T, _A> & { pipelineSet?: ObjectSet }
export type ObserveFunctionOptions = { apiName: string; params?: unknown }
export type ObserveFunctionCallbackArgs<_T = unknown> = { result: unknown; status: Status }
export type ObserveListOptions<_T = unknown, _RDPs = {}> = ObserveScrubFieldOptions<_T, _RDPs>
export type ObserveObjectCallbackArgs<_T = unknown> = { object: unknown; status: Status }
export type ObserveObjectsCallbackArgs<_T = unknown, _RDPs = {}> = ObserveObjectCallbackArgs<_T>

export type ScrubDisposable = { unsubscribe(): void; dispose(): void; closed: boolean }

export type ActionSignatureFromDef<_T = unknown> = {
  applyAction(args: unknown, opts?: unknown): Promise<ActionEditResponse>
}

export type QueryParameterType<_T = unknown> = Record<string, unknown>
export type QueryReturnType<_T = unknown> = unknown

export type FetchedObjectTypeDefinition = ObjectTypeDefinition & ObjectOrInterfaceDefinition & {
  links: Record<string, LinkDefinition>
  interfaceMap?: Record<string, Record<string, string>>
  primaryKeyApiName: string
}

export type FetchedPiiFieldTypeDefinition = FetchedObjectTypeDefinition

export type ScrubRecord<_T = unknown> = {
  [key: string]: unknown
  [key: symbol]: unknown
  $objectType: string
  $primaryKey: string | number
  $apiName?: string
  $piiFieldType?: string
  $piiKey?: string | number
  $title?: string
  $rid?: string
  $as?: (apiName: string) => unknown
}

export type NormalizedProcedure<_C = unknown> = (def: ObjectOrInterfaceDefinition | string) => PipelineSet

export type MinimalCoachClient = import('./coach-client/MinimalCoachClientContext').MinimalCoachClient

export type AggregationResultsWithoutGroups<_Q = any, _AC = any> = { data: unknown[]; excludedItems?: number }
export type AggregationResultsWithGroups<_Q = any, _AC = any> = { data: Array<{ group: Record<string, unknown>; metrics: Record<string, number> }> }
export type CoachRecordLinksObject<_Q = any> = Record<string, unknown>
export type SingleLinkAccessor<_Q = any, _L extends string = string> = { get(): Promise<Coach.Instance | undefined> }

export type PiiFieldKey<_T extends string = string, _V = unknown, _Q = unknown, _O extends unknown[] = unknown[]> = {
  type: string
  otherKeys: unknown[]
  __piiFieldKey?: { value: _V; query: unknown }
}
export type ScrubNormalized<T = unknown> = T & { __scrubNormalized?: true }
export type PrivacyScrub<T = unknown> = { subscribe(observer: Observer<T>): { unsubscribe(): void } }
export type SubjectPayload<_K = unknown> = { value: unknown; status: string; lastUpdated?: number; isDeferred?: boolean }
export type QuerySubscription<_Q = unknown> = ScrubDisposable
export class AbstractHelper<_Q = unknown, _O = unknown> { store: any; piiFieldKeys: any; _subscribe(..._args: unknown[]): any { return {} } }
export class Query<_K = unknown, _P = unknown, _O = unknown> {
  piiFieldKey!: PiiFieldKey
  store: any
  logger?: Logger
  options: any
  sortingStrategy: any
  nextPageToken?: string
  pendingFetch?: Promise<void>
  abortController?: AbortController
  revalidate(_force: boolean): Promise<void> { return Promise.resolve() }
  setStatus(_status: string, _batch: unknown): void {}
  writeToStore(..._args: unknown[]): unknown { return undefined }
  _updateScrubField(..._args: unknown[]): void {}
  createWebsocketSubscription(..._args: unknown[]): void {}
  getEffectiveFetchPageSize(): number { return 100 }
  fetchMore(): Promise<void> { return Promise.resolve() }
  piiFieldKeys!: PiiFieldKeys
  apiName!: string
  scrubNormalizedWhere: unknown
  minResultsToLoad?: number
}
export class PiiFieldKeys<_K = unknown> { get<T = unknown>(..._args: unknown[]): T { return undefined as any } retain(_k: unknown): void {} release(_k: unknown): void {} }
export class BaseScrubFieldQuery<_K = unknown, _P = unknown, _O = unknown> extends Query<_K, _P, _O> {
  pendingPageFetch?: Promise<void>
  currentTotalCount?: string
}
export class CachingScrubNormalizer<_I = unknown, _O = unknown> { scrubNormalize(_input: unknown): unknown { return undefined } }
export type ScrubDefinition<_T = unknown> = { apiName: string; fields?: string[] }
export type PiiKeyType<_T = unknown> = string | number
export type CollectionConnectableParams = { resolvedData?: unknown[]; isDeferred?: boolean; status?: string; lastUpdated?: number; totalCount?: number; hasMore?: boolean }
export type BatchContext = { read(key: unknown): { value: any } | undefined; write(key: unknown, data: unknown, status: string): unknown; delete(key: unknown, status: string): unknown; changes: Changes; deferredWrite?: boolean }
export type Changes = { modified: Set<PiiFieldKey>; deleted: Set<PiiFieldKey>; addedObjects: Map<string, unknown>; modifiedObjects: Map<string, unknown>; registerPipelineSet(k: PiiFieldKey): void; registerScrubField(k: PiiFieldKey): void; registerFunction(k: PiiFieldKey): void; registerObject?(k: unknown, v: unknown, isNew: boolean): void; deleteObject?(k: unknown): void }
export type Entry<_K = unknown> = { value: unknown; status: string; lastUpdated?: number }
export type ObjectPayload = { status: Status; object?: unknown; lastUpdated?: number; isDeferred?: boolean }
export type ScrubFieldPayload = { data: unknown[]; totalCount?: number; status: string; fetchMore?: () => Promise<void>; hasMore?: boolean; resolvedScrubField?: unknown[]; isDeferred?: boolean; lastUpdated?: number; pipelineSet?: unknown }
export type LinkPayload = { data: unknown[]; totalCount?: number; status: string; fetchMore?: () => Promise<void>; hasMore?: boolean; resolvedScrubField?: unknown[]; isDeferred?: boolean; lastUpdated?: number; linkedObjectsBySourcePrimaryKey?: unknown }
export type FunctionPayload = { result?: unknown; status: Status }
export type Subscription = { unsubscribe(): void; add(teardown: () => void): void; closed: boolean }
export const Subscription: { new(): Subscription } = class { unsubscribe() {} add(_t: () => void) {} closed = false } as any
export type ScrubDisposableWrapper = ScrubDisposable
export const ScrubDisposableWrapper: { new(sub: Subscription): ScrubDisposable } = class { constructor(public sub: any) {} unsubscribe() { this.sub?.unsubscribe() } dispose() { this.unsubscribe() } get closed() { return this.sub?.closed ?? true } } as any
export type SortingStrategy = { sortPiiFieldKeys(keys: unknown[], batch: unknown): unknown[] }
export type OrderBySortingStrategy = SortingStrategy
export const OrderBySortingStrategy: { new(...args: unknown[]): SortingStrategy } = class { sortPiiFieldKeys(k: unknown[]) { return k } } as any
export type PivotInfo = { linkName: string; sourceType: string; sourceTypeKind: 'object' | 'interface' }

export type ScrubFieldQueryOptions<_T = any> = ObserveScrubFieldOptions<_T>
export type FunctionObserveOptions = ObserveFunctionOptions & { dependsOn?: Array<string | { apiName: string }>; $parameters?: unknown }
export type ObserveAggregationArgs<_T = unknown, _A = unknown> = { apiName: string; aggregate?: unknown }
export type ObjectPiiFieldKey = PiiFieldKey & { __objectKey?: true }
export type ScrubFieldPiiFieldKey = PiiFieldKey & { __scrubFieldKey?: true }
export type FunctionPiiFieldKey = PiiFieldKey & { __functionKey?: true }
export type AggregationPiiFieldKey = PiiFieldKey & { __aggregationKey?: true }
export type MediaMetadataPiiFieldKey = PiiFieldKey & { __mediaMetadataKey?: true }
export type SpecificLinkPiiFieldKey = PiiFieldKey & { __specificLinkKey?: true }
export type ObjectSetPiiFieldKey = PiiFieldKey & { __objectSetKey?: true }
export type KnownPiiFieldKey = PiiFieldKey

export type WeakRefTrie<V = unknown> = { lookupArray(keys: readonly unknown[]): V | undefined }

export type ObjectSetArrayScrubNormalizer = { scrubNormalize(v: unknown): ScrubNormalized<unknown[]>; scrubNormalizeUnion?(v: unknown): ScrubNormalized<unknown[]>; scrubNormalizeIntersect?(v: unknown): ScrubNormalized<unknown[]>; scrubNormalizeSubtract?(v: unknown): ScrubNormalized<unknown[]> }

export type SimpleCoachProperties = { $objectType: string; $primaryKey: string | number; [key: symbol]: unknown; $apiName?: string; $piiFieldType?: unknown; $piiKey?: unknown; $title?: string; $rid?: string; [key: string]: unknown }
export type InterfaceHolder<_T = unknown> = Coach.Instance

export type ObjectState_Enum = 'ADDED_OR_UPDATED' | 'REMOVED'

export type RefCounts<_T = unknown> = { gc(): void; has(key: unknown): boolean; register(key: unknown): void }

export type CoachClient = MinimalCoachClient

export type MediaMetadataObserveOptions = { apiName?: string; piiKey?: unknown; preview?: boolean }
export type MediaMetadataPayload = { metadata?: unknown; status: string; lastUpdated?: number; isDeferred?: boolean }

export function objectMatchesWhereClause(_obj: unknown, _clause: unknown, _strict?: boolean): boolean { return true }
export function removeDuplicates<T>(arr: T[], _batch?: unknown): T[] { return arr }
export function getWirePipelineSet(os: unknown): ObjectSet { return os as ObjectSet }
export function isPipelineSet(_v: unknown): boolean { return false }
export function augmentRequestContext(ctx: unknown, _fn: unknown): unknown { return ctx }
export function resolveBaseObjectSetType(_type: unknown): unknown { return {} }
export function createCollectionConnectable<_K = unknown, _P = unknown>(..._args: unknown[]): unknown { return {} }
export function reloadDataAsFullObjects(_client: unknown, data: unknown[]): Promise<unknown[]> { return Promise.resolve(data) }
export function getBulkObjectLoader(_client: unknown): { load(...args: unknown[]): Promise<unknown> } { return { load: () => Promise.resolve(undefined) } }
export function DEBUG_ONLY__changesToString(_changes: unknown): string { return '' }
export function DEBUG_ONLY__piiFieldKeysToString(_keys: unknown): string { return '' }
export function getPiiFieldTypesThatInvalidate(..._args: unknown[]): Promise<{ resultType: string; invalidationSet: Set<string> }> { return Promise.resolve({ resultType: '', invalidationSet: new Set() }) }
export function createCoachRecord(_client: unknown, _def: unknown, _props: unknown): ScrubRecord { return { $objectType: '', $primaryKey: '' } as ScrubRecord }
export function getMediaPiiFieldKey(_loc: unknown): string { return '' }

export const ObjectDefRef = Symbol('ObjectDefRef')
export const UnderlyingCoachRecord = Symbol('UnderlyingCoachRecord')
export const ClientRef = Symbol('ClientRef')

export type DeferredBuilder = { updateObject?(value: unknown): void; deleteObject?(value: unknown): void; addLink?(source: unknown, target: unknown, linkType: string): void; deleteLink?(source: unknown, target: unknown, linkType: string): void }

export namespace GeoJSON { export type Point = { type: 'Point'; coordinates: [number, number] } }

export namespace Store { export type ApplyActionOptions = { mode?: string } }

export namespace ObjectMetadata { export type Link = LinkDefinition }

export const additionalContext = Symbol('additionalContext')

export type BlobMemoryManager = { get(key: string): Blob | undefined; add(key: string, blob: Blob): void; remove(key: string): void; clear(): void; dispose(): void; createBlobUrl(key: string): string | undefined; releaseBlobUrl(key: string): void }

export type ObjectHolder<_T = unknown> = Coach.Instance & { $primaryKey: string | number; [key: symbol]: unknown }

export type Chalk = { red(s: string): string; green(s: string): string; blue(s: string): string; yellow(s: string): string; gray(s: string): string; cyan(s: string): string; magenta(s: string): string; redBright(s: string): string; bgRed(s: string): string; bgGreen(s: string): string; bgCyan(s: string): string; bgGray(s: string): string; bgYellow(s: string): string; bgRedBright(s: string): string }

export type DerivedStatDefinition = { type: string; operation: { type: string; selectedPropertyApiName?: string }; objectSet?: ObjectSet }

export type OrderBy<_T = any> = Record<string, 'asc' | 'desc' | undefined>

export type ObserveObjectSetArgs<_T = unknown, _RDPs = {}> = { data: unknown[]; status: Status; hasMore: boolean; fetchMore: () => Promise<void>; totalCount?: number }

export type ScrubNormalizedizedOptions<T = unknown> = T
export type ScrubNormalizedizeOptionsInput<T = unknown> = T
export type PrivacyScrubClient = {
  observeObject(...args: unknown[]): ScrubDisposable
  observeScrubField(...args: unknown[]): ScrubDisposable
  observeAggregation(...args: unknown[]): ScrubDisposable
  observeFunction(...args: unknown[]): ScrubDisposable
  observeLinks(...args: unknown[]): ScrubDisposable
  observeMediaMetadata(...args: unknown[]): ScrubDisposable
  observePipelineSet(...args: unknown[]): ScrubDisposable
  applyAction(...args: unknown[]): Promise<unknown>
  validateAction(...args: unknown[]): Promise<unknown>
  invalidateAll(): Promise<void>
  invalidateObjects(...args: unknown[]): Promise<void>
  invalidatePiiFieldType(...args: unknown[]): Promise<void>
  invalidateFunction(...args: unknown[]): Promise<void>
  invalidateFunctionsByObject(...args: unknown[]): Promise<void>
  scrubNormalizeWhereClause(...args: unknown[]): unknown
  scrubNormalizeOptions(...args: unknown[]): unknown
  getCacheSnapshot(): Promise<CacheSnapshot>
}
export type SpecificLinkPayload = LinkPayload
export type ObjectSetPayload = ScrubFieldPayload
export type ObserveScrubFieldCallbackArgs = { data: unknown[]; status: Status; hasMore: boolean; fetchMore: () => Promise<void>; totalCount?: number }
export type ObserveLinksCallbackArgs = ObserveScrubFieldCallbackArgs
export type mergeObjectFields = (...args: unknown[]) => unknown
export type mergeSelectFields = (...args: unknown[]) => unknown
export function mergeObjectFields(..._args: unknown[]): unknown { return {} }
export function mergeSelectFields(..._args: unknown[]): unknown { return [] }
export type MediaReferenceProperties_Static = typeof MediaReferenceProperties
