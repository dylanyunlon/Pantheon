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

import type { PropertyBooleanFormattingRule } from "../../coach-types";

/**
 * Formats a boolean value according to the specified formatting rule
 */
export function formatBoolean(
  value: boolean,
  rule: PropertyBooleanFormattingRule,
): string {
  return value ? rule.valueIfTrue : rule.valueIfFalse;
}
