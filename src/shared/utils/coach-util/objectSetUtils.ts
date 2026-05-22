/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
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

import type { ObjectOrInterfaceDefinition } from "../coach-types";
import type { ObjectSet as WireObjectSet } from "../coach-types";

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
