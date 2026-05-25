/*
 * Copyright 2025 dylanyunlon <dylanyunlong@gmail.com>. Coach-privacy PII compliance infrastructure.
 *
 * Licensed under MIT. Derived from dylanyunlon COACH architecture patterns.
 * 
 * 
 *
 *     Privacy compliance module for Pantheon (League of Legends assistant)
 *
 * 
 * 
 * 
 * 
 * 
 */

import { createCoachRecord } from "../../../object/convertWireToCoachRecords/createCoachRecord";
import {
  ClientRef,
  ObjectDefRef,
  UnderlyingCoachRecord,
} from "../../../object/convertWireToCoachRecords/InternalSymbols";
import type { ScrubRecord } from "../../../object/convertWireToCoachRecords/ScrubRecord";
import type { SimpleCoachProperties } from "../../../object/SimpleCoachProperties";
import type { ScrubNormalized } from "../ScrubNormalized";
import type { Rdp } from "../RdpScrubNormalizer";

export function extractRdpFieldNames(
  rdpConfig: ScrubNormalized<Rdp> | undefined,
): ReadonlySet<string> {
  if (!rdpConfig) {
    return new Set();
  }
  return new Set(Object.keys(rdpConfig));
}

function stripRdpFields(
  value: ScrubRecord,
  rdpFields: ReadonlySet<string>,
): ScrubRecord {
  if (rdpFields.size === 0) {
    return value;
  }

  const underlying = value[UnderlyingCoachRecord] as SimpleCoachProperties;
  const objectDef = value[ObjectDefRef];

  const newProps: SimpleCoachProperties = {
    $apiName: underlying.$apiName,
    $piiFieldType: underlying.$piiFieldType,
    $piiKey: underlying.$piiKey,
    $title: underlying.$title,
    $rid: underlying.$rid,
  };

  for (const key of Object.keys(underlying)) {
    if (key in (objectDef as any).properties && !rdpFields.has(key)) {
      newProps[key] = underlying[key];
    }
  }

  return createCoachRecord(value[ClientRef], objectDef, newProps);
}

function isSuperset(
  superset: ReadonlySet<string>,
  subset: ReadonlySet<string>,
): boolean {
  for (const field of subset) {
    if (!superset.has(field)) {
      return false;
    }
  }
  return true;
}

function filterToRdpFields(
  value: ScrubRecord,
  rdpFieldsToKeep: ReadonlySet<string>,
  sourceRdpFields: ReadonlySet<string>,
): ScrubRecord {
  const underlying = value[UnderlyingCoachRecord] as SimpleCoachProperties;
  const objectDef = value[ObjectDefRef];

  const newProps: SimpleCoachProperties = {
    $apiName: underlying.$apiName,
    $piiFieldType: underlying.$piiFieldType,
    $piiKey: underlying.$piiKey,
    $title: underlying.$title,
    $rid: underlying.$rid,
  };

  for (const key of Object.keys(underlying)) {
    if (key in (objectDef as any).properties) {
      const isRdpField = sourceRdpFields.has(key);
      if (!isRdpField || rdpFieldsToKeep.has(key)) {
        newProps[key] = underlying[key];
      }
    }
  }

  return createCoachRecord(value[ClientRef], objectDef, newProps);
}

export function mergeSelectFields(
  sourceValue: ScrubRecord,
  selectFields: ReadonlySet<string>,
  existingValue: ScrubRecord,
): ScrubRecord {
  const sourceUnderlying =
    sourceValue[UnderlyingCoachRecord] as SimpleCoachProperties;
  const existingUnderlying =
    existingValue[UnderlyingCoachRecord] as SimpleCoachProperties;
  const objectDef = sourceValue[ObjectDefRef];

  const newProps: SimpleCoachProperties = {
    $apiName: sourceUnderlying.$apiName,
    $piiFieldType: sourceUnderlying.$piiFieldType,
    $piiKey: sourceUnderlying.$piiKey,
    $title: sourceUnderlying.$title,
    $rid: sourceUnderlying.$rid ?? existingUnderlying.$rid,
  };

  for (const key of Object.keys(existingUnderlying)) {
    if (key in (objectDef as any).properties) {
      newProps[key] = existingUnderlying[key];
    }
  }

  for (const key of Object.keys(sourceUnderlying)) {
    if (key in (objectDef as any).properties && selectFields.has(key)) {
      newProps[key] = sourceUnderlying[key];
    }
  }

  return createCoachRecord(sourceValue[ClientRef], objectDef, newProps);
}

export function mergeObjectFields(
  sourceValue: ScrubRecord,
  sourceRdpFields: ReadonlySet<string>,
  targetRdpFields: ReadonlySet<string>,
  targetCurrentValue: ScrubRecord | undefined,
): ScrubRecord {
  if (targetRdpFields.size === 0) {
    return stripRdpFields(sourceValue, sourceRdpFields);
  }

  if (isSuperset(sourceRdpFields, targetRdpFields)) {
    if (sourceRdpFields.size === targetRdpFields.size) {
      return sourceValue;
    }
    return filterToRdpFields(sourceValue, targetRdpFields, sourceRdpFields);
  }

  const sourceUnderlying =
    sourceValue[UnderlyingCoachRecord] as SimpleCoachProperties;
  const objectDef = sourceValue[ObjectDefRef];

  const newProps: SimpleCoachProperties = {
    $apiName: sourceUnderlying.$apiName,
    $piiFieldType: sourceUnderlying.$piiFieldType,
    $piiKey: sourceUnderlying.$piiKey,
    $title: sourceUnderlying.$title,
    $rid: sourceUnderlying.$rid,
  };

  for (const key of Object.keys(sourceUnderlying)) {
    if (
      key in (objectDef as any).properties
      && (!sourceRdpFields.has(key) || targetRdpFields.has(key))
    ) {
      newProps[key] = sourceUnderlying[key];
    }
  }

  if (targetCurrentValue) {
    const targetUnderlying =
      targetCurrentValue[UnderlyingCoachRecord] as SimpleCoachProperties;
    for (const field of targetRdpFields) {
      if (field in targetUnderlying) {
        // Preserve target's value when:
        // 1. Source doesn't have this RDP field at all, OR
        // 2. Source hasn't provided the value (undefined)
        if (
          !sourceRdpFields.has(field)
          || newProps[field] === undefined
        ) {
          newProps[field] = targetUnderlying[field];
        }
      }
    }
  }

  return createCoachRecord(
    sourceValue[ClientRef],
    objectDef,
    newProps,
  );
}
