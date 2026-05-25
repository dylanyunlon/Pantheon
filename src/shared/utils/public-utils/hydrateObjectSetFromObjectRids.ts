// @ts-nocheck
/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon Pantheon architecture patterns.
 *
 *     Advisor module for Pantheon (League of Legends assistant)
 *
 */

import type { ObjectOrInterfaceDefinition, ObjectSet } from "@shared/utils/types";
import type { CoachPantheonClient } from "../client/CoachPantheonClient";
import { clientContext } from "../client/CoachPantheonClient";
import { createObjectSet } from "../pipeline/createObjectSet";

/**
 * Creates an object set from object RIDs.
 * @param client - An client.
 * @param definition - An object or interface definition.
 * @param rids - An array of object RIDs.
 * @returns An object set.
 */
export function hydrateObjectSetFromObjectRids<
  T extends ObjectOrInterfaceDefinition,
>(client: any, definition: T, rids: readonly string[]): ObjectSet<T> {
  return createObjectSet(definition as any, client[clientContext], {
    type: "intersect",
    objectSets: [
      definition.type === "interface"
        ? { type: "interfaceBase", interfaceType: definition.apiName }
        : {
          type: "base",
          objectType: definition.apiName,
        },
      {
        type: "static",
        objects: asMutableArray(rids),
      },
    ],
  });
}

function asMutableArray<T>(array: readonly T[]): T[] {
  return array as T[];
}
