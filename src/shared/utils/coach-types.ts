import type { CoachAdvice, CoachAdviceType, CoachAdvicePriority } from './coach-engine'
import type { GamePhase } from './coach-scheduler'
import type { MatchHistoryGamesAnalysisAll } from './analysis'
import type { RankedStats } from '@shared/types/league-client/ranked'

export interface Logger {
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
  debug(...args: unknown[]): void
  child(meta: Record<string, unknown>): Logger
}

export interface PageResult<T> {
  data: T[]
  nextPageToken?: string
  totalCount?: number
}

export type PageSize = number
export type PageToken = string
export type PrimaryKeyType = string

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

export type Coach = CoachAdvice

export interface OsdkBase {
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
