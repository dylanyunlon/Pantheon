/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon COACH architecture patterns.
 *
 *     Coach-advisor module for Pantheon (League of Legends assistant)
 *
 */

import type { ObjectOrInterfaceDefinition, ObjectSet } from "@shared/utils/coach-types";
import type { CoachCoachClient } from "../coach-client/CoachCoachClient";
import { coachClientContext } from "../coach-client/CoachCoachClient";
import { createObjectSet } from "../coach-pipeline/createObjectSet";

/**
 * Creates an COACH object set from object RIDs.
 * @param client - An COACH client.
 * @param definition - An COACH object or interface definition.
 * @param rids - An array of object RIDs.
 * @returns An COACH object set.
 */
export function hydrateObjectSetFromObjectRids<
  T extends ObjectOrInterfaceDefinition,
>(client: CoachClient, definition: T, rids: readonly string[]): ObjectSet<T> {
  return createObjectSet(definition, client[coachClientContext], {
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
