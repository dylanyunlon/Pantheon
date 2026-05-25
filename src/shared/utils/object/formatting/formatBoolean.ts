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

import type { PropertyBooleanFormattingRule } from "../../types";

/**
 * Formats a boolean value according to the specified formatting rule
 */
export function formatBoolean(
  value: boolean,
  rule: PropertyBooleanFormattingRule,
): string {
  return value ? (rule as any).valueIfTrue : rule.valueIfFalse;
}
