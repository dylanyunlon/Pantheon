// @ts-nocheck
/*
 * Copyright 2025 dylanyunlon <dylanyunlong@gmail.com>. Coach-privacy PII compliance infrastructure.
 *
 * Licensed under MIT. Derived from dylanyunlon Pantheon architecture patterns.
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

import { createPantheonRecord } from "../../../object/convertWireToPantheonRecords/createPantheonRecord";
import {
  ClientRef,
  ObjectDefRef,
  UnderlyingPantheonRecord,
} from "../../../object/convertWireToPantheonRecords/InternalSymbols";
import type { ScrubRecord } from "../../../object/convertWireToPantheonRecords/ScrubRecord";
import type { SimplePantheonProperties } from "../../../object/SimplePantheonProperties";
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

  const underlying = (value as any)[UnderlyingPantheonRecord] as SimplePantheonProperties;
  const objectDef = (value as any)[ObjectDefRef];

  const newProps: SimplePantheonProperties = {
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

  return createPantheonRecord((value as any)[ClientRef], objectDef, newProps);
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
  const underlying = (value as any)[UnderlyingPantheonRecord] as SimplePantheonProperties;
  const objectDef = (value as any)[ObjectDefRef];

  const newProps: SimplePantheonProperties = {
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

  return createPantheonRecord((value as any)[ClientRef], objectDef, newProps);
}

export function mergeSelectFields(
  sourceValue: ScrubRecord,
  selectFields: ReadonlySet<string>,
  existingValue: ScrubRecord,
): ScrubRecord {
  const sourceUnderlying =
    (sourceValue as any)[UnderlyingPantheonRecord] as SimplePantheonProperties;
  const existingUnderlying =
    (existingValue as any)[UnderlyingPantheonRecord] as SimplePantheonProperties;
  const objectDef = (sourceValue as any)[ObjectDefRef];

  const newProps: SimplePantheonProperties = {
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

  return createPantheonRecord((sourceValue as any)[ClientRef], objectDef, newProps);
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
    (sourceValue as any)[UnderlyingPantheonRecord] as SimplePantheonProperties;
  const objectDef = (sourceValue as any)[ObjectDefRef];

  const newProps: SimplePantheonProperties = {
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
      (targetCurrentValue as any)[UnderlyingPantheonRecord] as SimplePantheonProperties;
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

  return createPantheonRecord(
    (sourceValue as any)[ClientRef],
    objectDef,
    newProps,
  );
}
