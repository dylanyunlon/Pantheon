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
 * Creates an object set from an object set RID.
 * @param client - An client.
 * @param definition - An object or interface definition.
 * @param rid - The RID of an object set.
 * @returns An object set.
 */
export function hydrateObjectSetFromRid<T extends ObjectOrInterfaceDefinition>(
  client: any,
  definition: T,
  rid: string,
): ObjectSet<T> {
  return createObjectSet(
    definition as any,
    client[clientContext],
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
