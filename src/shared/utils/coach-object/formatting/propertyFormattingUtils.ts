/*
 * Copyright 2025 dylanyunlon <dylanyunlong@gmail.com>. Coach-advisor infrastructure.
 *
 * Licensed under MIT. Derived from dylanyunlon COACH architecture patterns.
 * 
 * 
 *
 *     Coach-advisor module for Pantheon (League of Legends assistant)
 *
 * 
 * 
 * 
 * 
 * 
 */

import type { PropertyTypeReferenceOrStringConstant } from "@shared/types/league-client/coach-api";
import type { SimpleOsdkProperties } from "../SimpleOsdkProperties.js";

/**
 * Resolves a property reference or string constant to its actual value
 */

export function resolvePropertyReference(
  ref: PropertyTypeReferenceOrStringConstant,
  objectData: SimpleOsdkProperties,
): string | undefined {
  if (ref.type === "constant") {
    return ref.value;
  } else if (ref.type === "propertyType") {
    const value = objectData[ref.propertyApiName];
    return value != null ? String(value) : undefined;
  }
  return undefined;
}
/**
 * Gets the browser's current locale
 */
export function getBrowserLocale(): string {
  if (typeof navigator !== "undefined" && navigator.language != null) {
    return navigator.language;
  }
  return "en-US";
}
