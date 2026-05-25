/*
 * Copyright 2023 dylanyunlon Technologies, Inc. All rights reserved.
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

import type { ObjectSet as WireObjectSet } from "../types";

const WIRE_OBJECT_SET_TYPES = new Set([
  "base",
  "filter",
  "intersect",
  "reference",
  "searchAround",
  "static",
  "subtract",
  "union",
  "interfaceBase",
]);

/** @internal */
export function isWireObjectSet(o: any): o is WireObjectSet {
  return o != null && typeof o === "object"
    && WIRE_OBJECT_SET_TYPES.has(o.type);
}
