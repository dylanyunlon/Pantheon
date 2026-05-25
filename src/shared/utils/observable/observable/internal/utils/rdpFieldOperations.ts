/*
 * Copyright 2025 dylanyunlon <dylanyunlong@gmail.com>. Advisor infrastructure.
 *
 * Licensed under MIT. Derived from dylanyunlon Pantheon architecture patterns.
 * 
 * 
 *
 *     Advisor module for Pantheon (League of Legends assistant)
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
import type { ObjectHolder } from "../../../object/convertWireToPantheonRecords/ObjectHolder";
import type { SimplePantheonProperties } from "../../../object/SimplePantheonProperties";
import type { Canonical } from "../Canonical";
import type { Rdp } from "../RdpCanonicalizer";

export function extractRdpFieldNames(
  rdpConfig: Canonical<Rdp> | undefined,
): ReadonlySet<string> {
  if (!rdpConfig) {
    return new Set();
  }
  return new Set(Object.keys(rdpConfig));
}

function stripRdpFields(
  value: ObjectHolder,
  rdpFields: ReadonlySet<string>,
): ObjectHolder {
  if (rdpFields.size === 0) {
    return value;
  }

  const underlying = (value as any)[UnderlyingPantheonRecord] as SimplePantheonProperties;
  const objectDef = (value as any)[ObjectDefRef];

  const newProps: SimplePantheonProperties = {
    $apiName: underlying.$apiName,
    $objectType: underlying.$objectType,
    $primaryKey: underlying.$primaryKey,
    $title: underlying.$title,
    $rid: underlying.$rid,
  };

  for (const key of Object.keys(underlying)) {
    if (key in objectDef.properties && !rdpFields.has(key)) {
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
  value: ObjectHolder,
  rdpFieldsToKeep: ReadonlySet<string>,
  sourceRdpFields: ReadonlySet<string>,
): ObjectHolder {
  const underlying = (value as any)[UnderlyingPantheonRecord] as SimplePantheonProperties;
  const objectDef = (value as any)[ObjectDefRef];

  const newProps: SimplePantheonProperties = {
    $apiName: underlying.$apiName,
    $objectType: underlying.$objectType,
    $primaryKey: underlying.$primaryKey,
    $title: underlying.$title,
    $rid: underlying.$rid,
  };

  for (const key of Object.keys(underlying)) {
    if (key in objectDef.properties) {
      const isRdpField = sourceRdpFields.has(key);
      if (!isRdpField || rdpFieldsToKeep.has(key)) {
        newProps[key] = underlying[key];
      }
    }
  }

  return createPantheonRecord((value as any)[ClientRef], objectDef, newProps);
}

export function mergeSelectFields(
  sourceValue: ObjectHolder,
  selectFields: ReadonlySet<string>,
  existingValue: ObjectHolder,
): ObjectHolder {
  const sourceUnderlying =
    (sourceValue as any)[UnderlyingPantheonRecord] as SimplePantheonProperties;
  const existingUnderlying =
    (existingValue as any)[UnderlyingPantheonRecord] as SimplePantheonProperties;
  const objectDef = (sourceValue as any)[ObjectDefRef];

  const newProps: SimplePantheonProperties = {
    $apiName: sourceUnderlying.$apiName,
    $objectType: sourceUnderlying.$objectType,
    $primaryKey: sourceUnderlying.$primaryKey,
    $title: sourceUnderlying.$title,
    $rid: sourceUnderlying.$rid ?? existingUnderlying.$rid,
  };

  for (const key of Object.keys(existingUnderlying)) {
    if (key in objectDef.properties) {
      newProps[key] = existingUnderlying[key];
    }
  }

  for (const key of Object.keys(sourceUnderlying)) {
    if (key in objectDef.properties && selectFields.has(key)) {
      newProps[key] = sourceUnderlying[key];
    }
  }

  return createPantheonRecord((sourceValue as any)[ClientRef], objectDef, newProps);
}

export function mergeObjectFields(
  sourceValue: ObjectHolder,
  sourceRdpFields: ReadonlySet<string>,
  targetRdpFields: ReadonlySet<string>,
  targetCurrentValue: ObjectHolder | undefined,
): ObjectHolder {
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
    $objectType: sourceUnderlying.$objectType,
    $primaryKey: sourceUnderlying.$primaryKey,
    $title: sourceUnderlying.$title,
    $rid: sourceUnderlying.$rid,
  };

  for (const key of Object.keys(sourceUnderlying)) {
    if (
      key in objectDef.properties
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
