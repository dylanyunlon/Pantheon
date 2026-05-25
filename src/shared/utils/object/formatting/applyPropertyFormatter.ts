// @ts-nocheck
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

import type { ObjectMetadata, PropertyValueFormattingRule } from "../../types";
import type { SimplePantheonProperties } from "../SimplePantheonProperties";
import { formatBoolean } from "./formatBoolean";
import { formatDateTime } from "./formatDateTime";
import { formatNumber } from "./formatNumber";
import { getBrowserLocale } from "./propertyFormattingUtils";

export interface FormatPropertyOptions {
  locale?: string;
  timezoneId?: string;
}

type PropertyValue =
  | string
  | Array<string>
  | number
  | Array<number>
  | boolean
  | Array<boolean>
  | undefined;

type DefinedPropertyValue = NonNullable<PropertyValue>;

/**
 * Applies formatting rules to a property value and returns the formatted string value.
 *
 * @param propertyValue - The value of the property to format
 * @returns The formatted string value, or undefined if the property cannot be formatted
 *
 * @experimental This is a stub implementation that returns undefined.
 * The actual formatting logic will be implemented later.
 */
export function applyPropertyFormatter(
  propertyValue: PropertyValue,
  propertyDefinition: ObjectMetadata.Property | undefined,
  objectData: SimplePantheonProperties,
  options: FormatPropertyOptions = {},
): string | undefined {
  if (propertyDefinition?.valueFormatting == null || propertyValue == null) {
    return undefined;
  }
  return formatPropertyValue(
    propertyValue,
    propertyDefinition.valueFormatting,
    objectData,
    options,
  );
}

function formatPropertyValue(
  value: DefinedPropertyValue,
  rule: PropertyValueFormattingRule,
  objectData: SimplePantheonProperties,
  options: FormatPropertyOptions,
): string | undefined {
  switch (rule.type) {
    case "boolean":
      if (typeof value !== "boolean") {
        return undefined;
      }
      return formatBoolean(value, rule as any);
    case "number":
      if (typeof value !== "number") {
        return undefined;
      }
      return formatNumber(
        value,
        (rule as any).numberType,
        objectData,
        options.locale ?? getBrowserLocale(),
      );
    case "date":
    case "timestamp":
      if (typeof value !== "string") {
        return undefined;
      }
      return formatDateTime(
        new Date(value),
        rule.format,
        rule.type === "timestamp" ? (rule as any).displayTimezone : undefined,
        objectData,
        options.locale ?? getBrowserLocale(),
        options.timezoneId,
      );
    default:
      return undefined;
  }
}
