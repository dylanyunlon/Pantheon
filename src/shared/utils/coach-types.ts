import type { CoachAdvice, CoachAdviceType, CoachAdvicePriority } from './coach-engine'
import type { GamePhase } from './coach-scheduler'
import type { MatchHistoryGamesAnalysisAll } from './analysis'
import type { RankedStats } from '@shared/types/league-client/ranked'

export interface Logger {
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
  debug(...args: unknown[]): void
  child(meta: Record<string, unknown>, extra?: Record<string, unknown>): Logger
}

export interface PageResult<T> {
  data: T[]
  nextPageToken?: string
  totalCount?: number
}

export type PageSize = number
export type PageToken = string

export interface ObjectTypeDefinition {
  apiName: string
  displayName: string
  properties: Record<string, PropertyDefinition>
  primaryKey: string
}

export interface PropertyDefinition {
  apiName: string
  dataType: string
  nullable: boolean
  displayName?: string
}

export interface InterfaceMetadata {
  apiName: string
  properties: Record<string, PropertyDefinition>
}

export interface ObjectMetadata extends ObjectTypeDefinition {
  links: Record<string, LinkDefinition>
}

export interface LinkDefinition {
  apiName: string
  targetType: string
  cardinality: 'ONE' | 'MANY'
}

export interface ActionDefinition {
  apiName: string
  parameters: Record<string, ParameterDefinition>
}

export interface ParameterDefinition {
  dataType: string
  required: boolean
}

export interface ActionEditResponse {
  edits: Array<{ objectType: string; primaryKey: string; action: 'ADD' | 'MODIFY' | 'DELETE' }>
}

export type ActionValidationResponse = {
  valid: boolean
  errors: Array<{ message: string }>
}

export interface QueryDefinition {
  apiName: string
  parameters: Record<string, ParameterDefinition>
  output: { dataType: string }
}

export interface CompileTimeMetadata<T = unknown> {
  type: string
  definition: T
}


export interface CoachRecordBase {
  $objectType: string
  $primaryKey: string
  $apiName: string
}

export type PropertyKeys<T> = keyof T & string

export type WirePropertyTypes = string | number | boolean | null

export interface WhereClause {
  [field: string]: {
    $eq?: unknown
    $ne?: unknown
    $gt?: unknown
    $gte?: unknown
    $lt?: unknown
    $lte?: unknown
    $in?: unknown[]
    $contains?: string
    $isNull?: boolean
  }
}

export type PossibleWhereClauseFilters =
  | '$eq' | '$ne' | '$gt' | '$gte' | '$lt' | '$lte'
  | '$in' | '$contains' | '$isNull'
  | '$startsWith' | '$containsAllTerms' | '$containsAllTermsInOrder'
  | '$containsAnyTerm' | '$interval' | '$matchesRegex'
  | '$intersects' | '$within'

export interface AggregationClause {
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
}

export type SearchJsonQueryV2 = WhereClause

export interface ObjectSet {
  type: 'base' | 'union' | 'intersect' | 'filter' | 'searchAround'
  objectType?: string
  where?: WhereClause
  objectSets?: ObjectSet[]
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

export interface DerivedPropertyDefinition extends DerivedProperty {
  objectTypes: string[]
}

export type DataValue = string | number | boolean | null | DataValue[] | { [key: string]: DataValue }

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

export interface ObjectOrInterfaceDefinition {
  apiName: string
  properties: Record<string, PropertyDefinition>
  type: 'object' | 'interface'
}

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

export const Actions = {
  applyAction: async (_client: unknown, _action: unknown, _params: unknown) => ({} as ActionEditResponse)
}

export const Attachments = {
  upload: async (_client: unknown, _upload: AttachmentUpload) => ({} as Attachment)
}

export const Functions = {
  applyFunction: async (_client: unknown, _fn: unknown, _params: unknown) => ({} as unknown)
}

export const GameStateObjectSets = {
  create: (_client: unknown, _type: string) => ({} as ObjectSet)
}

export const Queries = {
  execute: async (_client: unknown, _query: unknown, _params: unknown) => ({} as unknown)
}

export const MediaSets = {
  upload: async (_client: unknown, _ref: MediaReference, _data: Blob | ArrayBuffer) => {},
  getUrl: (_client: unknown, _ref: MediaReference) => ''
}





export type PrimaryKeyTypes = string | number

export interface QueryDataTypeDefinition {
  type: string
  subType?: string
  objectTypeApiName?: string
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

export interface TransformOptions {
  transformations: Transformation[]
  outputFormat?: string
}

export const USER_AGENT_HEADER = 'X-Coach-User-Agent'

export interface GameStateObjectV2 {
  __apiName: string
  __primaryKey: string
  __rid?: string
  [key: string]: unknown
}


export type InterfaceDefinition = ObjectOrInterfaceDefinition & { type: 'interface' }

export type PiiFieldTypeDefinition = ObjectOrInterfaceDefinition
export type PiiKeyType = string | number
export type PrivacyConfig = { enabled: boolean; rules: Record<string, unknown> }
export type ScrubDefinition = { apiName: string; fields: string[] }

export type AsyncIterArgs<Q extends ObjectOrInterfaceDefinition = ObjectOrInterfaceDefinition> = {
  $pageSize?: number
  $select?: PropertyKeys<Q>[]
}

export type Augments = Record<string, unknown>

export type FetchPageResult<T> = PageResult<T>

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

export type ObjectSetArgs<Q extends ObjectOrInterfaceDefinition = ObjectOrInterfaceDefinition> = {
  $pageSize?: number
  $select?: PropertyKeys<Q>[]
  $where?: WhereClause
}

export type ObjectSetSubscription = {
  unsubscribe(): void
}

export type Result<T> = { type: 'ok'; value: T } | { type: 'err'; error: unknown }

export type SelectArg<Q extends ObjectOrInterfaceDefinition = ObjectOrInterfaceDefinition> = PropertyKeys<Q>[]

export type SingleOsdkResult<Q extends ObjectOrInterfaceDefinition = ObjectOrInterfaceDefinition> = Coach.Instance<Q> | undefined

export type PropertyApiName<Q extends ObjectOrInterfaceDefinition = ObjectOrInterfaceDefinition> = PropertyKeys<Q>

export type FetchLinksPageResult<T = unknown> = PageResult<T> & { sourceApiName: string }

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

export type DataValueClientToWire<T = unknown> = T
export type DataValueWireToClient<T = unknown> = T

export type InterfaceQueryDataType = QueryDataTypeDefinition & { interface: string }
export type ObjectQueryDataType = QueryDataTypeDefinition & { object: string }
export type ObjectSetQueryDataType = QueryDataTypeDefinition & { objectSet: string }

export type QueryParam<T = unknown> = T
export type QueryResult<T = unknown> = T

export type AllowedBucketKeyTypes = string | number | boolean
export type AllowedBucketTypes = string | number | boolean | Date

export type QueryMetadata = {
  apiName: string
  displayName?: string
  description?: string
  parameters: Record<string, ParameterDefinition>
  output: QueryDataTypeDefinition
}

export type QueryParameterDefinition = ParameterDefinition

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

export type ObjectSpecifier<Q extends ObjectOrInterfaceDefinition = ObjectOrInterfaceDefinition> = {
  objectTypeApiName: Q['apiName']
  primaryKeyValue: PrimaryKeyType<Q>
}

export type ActionParam<T = unknown> = T

export type PrimaryKeyType<Q extends ObjectOrInterfaceDefinition = ObjectOrInterfaceDefinition> = string | number

export type CoachBase<Q extends ObjectOrInterfaceDefinition = ObjectOrInterfaceDefinition> = ObjectIdentifiers<Q> & {
  readonly $objectType: string
  readonly $title?: string
}

export type PipelineSet<Q extends ObjectOrInterfaceDefinition = ObjectOrInterfaceDefinition> = ObjectSet & {
  readonly __objectType?: Q
  aggregate(...args: unknown[]): Promise<unknown>
  fetchPage(args?: unknown): Promise<PageResult<Coach.Instance<Q>>>
  fetchPageWithErrors(args?: unknown): Promise<Result<PageResult<Coach.Instance<Q>>>>
  fetchOne(pk: PrimaryKeyType<Q>): Promise<Coach.Instance<Q>>
  fetchOneWithErrors(pk: PrimaryKeyType<Q>): Promise<Result<Coach.Instance<Q>>>
  where(clause: WhereClause | unknown): PipelineSet<Q>
  union(other: PipelineSet<Q>): PipelineSet<Q>
  intersect(other: PipelineSet<Q>): PipelineSet<Q>
  subtract(other: PipelineSet<Q>): PipelineSet<Q>
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
    readonly $primaryKey: string
    readonly $apiName: string
    $as(apiName: string): Coach.Instance<Q>
    [key: string]: unknown
  }
}

export type MediaReferenceProperties = {
  getMediaMetadata(client: unknown, ref: MediaReference): Promise<MediaMetadata>
  getMediaContent(client: unknown, ref: MediaReference): Promise<Blob>
}

export const MediaReferenceProperties: MediaReferenceProperties = {
  async getMediaMetadata(_client: unknown, _ref: MediaReference): Promise<MediaMetadata> {
    return { path: '', sizeBytes: 0, mediaType: '', updatedAt: '' }
  },
  async getMediaContent(_client: unknown, _ref: MediaReference): Promise<Blob> {
    return new Blob()
  },
}

export type TimeSeriesPropertiesV2 = Record<string, unknown>
export type TimeSeriesValueBankProperties = Record<string, unknown>
export type CoreMediaReference = MediaReference


export type ActionReturnTypeForOptions = any
export type AggregateObjectsRequestV2 = any
export type AggregateOpts = any
export type AggregateOptsThatErrorsAndDisallowsOrderingWithMultipleGroupBy = any
export type AggregationGroupByV2 = any
export type AggregationRangeV2 = any
export type AggregationResultsWithGroups = any
export type AggregationResultsWithoutGroups = any
export type AggregationsResults = any
export type AndWhereClause = any
export type ApplyActionOptions = any
export type ApplyBatchActionOptions = any
export type AudioEncoding = any
export type AudioOperation = any
export type AudioToTextOperation = any
export type Augment = any
export type BatchApplyActionResponseV2 = any
export type CoachRecordLinksObject = any
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
export type FetchPageArgs = any
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
export type SingleLinkAccessor = any
export type SpreadsheetToTextOperation = any
export type SyncApplyActionResponseV2 = any
export type TimeSeriesPoint = any
export type TimeSeriesProperty = any
export type TranscribeOutputFormat = any
export type VideoOperation = any
export type VideoToArchiveOperation = any
export type VideoToAudioOperation = any
export type VideoToImageOperation = any
export type VideoToTextOperation = any
export type VlmPreprocessingConfig = any
