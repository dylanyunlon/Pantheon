import type { PantheonAdvice } from '../engine'
import type { FeatureVector } from '../capture/experiment-capture'
import type { GamePhase } from '../scheduler'

export interface ShapePropertyConfig {
  nullabilityOp:
    | { type: 'dropIfNull' }
    | { type: 'withDefault'; defaultValue: unknown }
    | { type: 'withTransform'; transform: (v: unknown) => unknown }
    | { type: 'require' }
    | { type: 'select' }
}

export interface ShapeDefinition {
  name: string
  __props: Record<string, ShapePropertyConfig>
}

export interface NullabilityViolation {
  property: string
  primaryKey: unknown
  constraint: string
}

export interface ShapeTransformResult<T> {
  data: T | undefined
  dropped: boolean
  violations: NullabilityViolation[]
}

export function applyShapeTransformations<T extends Record<string, unknown>>(
  shape: ShapeDefinition,
  rawRecord: T | undefined
): ShapeTransformResult<T> {
  if (rawRecord === undefined) {
    return { data: undefined, dropped: false, violations: [] }
  }

  const primaryKey = (rawRecord as any).$primaryKey ?? (rawRecord as any).puuid ?? ''
  const transformedProps: Record<string, unknown> = {}
  const requireProps: string[] = []

  for (const prop of Object.keys(shape.__props)) {
    const config = shape.__props[prop]
    if (!config) continue

    const originalValue = rawRecord[prop]
    const op = config.nullabilityOp

    switch (op.type) {
      case 'dropIfNull': {
        if (originalValue == null) {
          return {
            data: undefined,
            dropped: true,
            violations: [{ property: prop, primaryKey, constraint: 'dropIfNull' }]
          }
        }
        break
      }
      case 'withDefault': {
        transformedProps[prop] = originalValue ?? op.defaultValue
        break
      }
      case 'withTransform': {
        try {
          transformedProps[prop] = op.transform(originalValue)
        } catch (e) {
          return {
            data: undefined,
            dropped: false,
            violations: [{ property: prop, primaryKey, constraint: 'transformError' }]
          }
        }
        break
      }
      case 'require': {
        requireProps.push(prop)
        break
      }
      case 'select':
        break
    }
  }

  const clonedRecord = Object.keys(transformedProps).length > 0
    ? { ...rawRecord, ...transformedProps }
    : rawRecord

  const violations: NullabilityViolation[] = []
  for (const prop of requireProps) {
    const value = (clonedRecord as Record<string, unknown>)[prop]
    if (value == null) {
      violations.push({ property: prop, primaryKey, constraint: 'require' })
    }
  }

  if (violations.length > 0) {
    return { data: undefined, dropped: false, violations }
  }

  return { data: clonedRecord as T, dropped: false, violations: [] }
}

export function applyShapeTransformationsToArray<T extends Record<string, unknown>>(
  shape: ShapeDefinition,
  rawRecords: T[]
): { data: T[]; droppedCount: number; violations: NullabilityViolation[] } {
  const results: T[] = []
  let droppedCount = 0
  const allViolations: NullabilityViolation[] = []

  for (const rawRecord of rawRecords) {
    const result = applyShapeTransformations(shape, rawRecord)
    if (result.dropped) {
      droppedCount++
    } else if (result.data !== undefined) {
      results.push(result.data)
    }
    allViolations.push(...result.violations)
  }

  return { data: results, droppedCount, violations: allViolations }
}
