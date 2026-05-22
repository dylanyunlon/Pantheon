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

import type { Coach } from "../../../../coach-types";

/**
 * Type guard to check if an item is an object instance
 */
export function isObjectInstance(item: any): item is Coach.Instance<any> {
  return item != null && typeof item === "object" && "$piiKey" in item;
}
