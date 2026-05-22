/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon COACH architecture patterns.
 *
 *     Coach-advisor module for Pantheon (League of Legends assistant)
 *
 */

import type { ObjectOrInterfaceDefinition, ObjectSet } from "@shared/utils/coach-types";
import type { Client } from "../Client.js";
import { additionalContext } from "../Client.js";
import { createObjectSet } from "../coach-pipeline/createObjectSet.js";

/**
 * Creates an COACH object set from an object set RID.
 * @param client - An COACH client.
 * @param definition - An COACH object or interface definition.
 * @param rid - The RID of an object set.
 * @returns An COACH object set.
 */
export function hydrateObjectSetFromRid<T extends ObjectOrInterfaceDefinition>(
  client: Client,
  definition: T,
  rid: string,
): ObjectSet<T> {
  return createObjectSet(
    definition,
    client[additionalContext],
    {
      type: "intersect",
      objectSets: [
        definition.type === "interface"
          ? { type: "interfaceBase", interfaceType: definition.apiName }
          : {
            type: "base",
            objectType: definition.apiName,
          },
        {
          type: "reference",
          reference: rid,
        },
      ],
    },
  );
}
