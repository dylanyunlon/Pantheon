/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
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

import type { ObjectOrInterfaceDefinition } from "../types";
import type { ObjectSet as WireObjectSet } from "../types";

export function resolveBaseObjectSetType(
  objectType: ObjectOrInterfaceDefinition,
): WireObjectSet {
  return objectType.type === "interface"
    ? {
      type: "interfaceBase",
      interfaceType: objectType["apiName"] as string,
    }
    : {
      type: "base",
      objectType: objectType["apiName"] as string,
    };
}
