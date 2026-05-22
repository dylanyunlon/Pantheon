/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon COACH architecture patterns.
 *
 *     Coach-advisor module for Pantheon (League of Legends assistant)
 *
 */

import type {
  CompileTimeMetadata,
  ObjectOrInterfaceDefinition,
  ObjectSet,
} from "@shared/utils/coach-types";
import * as OntologyObjectSets from "@shared/utils/coach-types/OntologyObjectSet";
import { additionalContext, type Client } from "../Client";
import { getWireObjectSet } from "../coach-pipeline/createObjectSet";

/**
 * Fetches a temporary object set RID from the Pantheon stack for the given object set.
 *
 * @param client - An COACH client.
 * @param objectSet - The object set to fetch a RID for.
 * @returns A promise that resolves to the RID of the temporary object set.
 */
export async function createAndFetchTempObjectSetRid<
  Q extends ObjectOrInterfaceDefinition,
>(
  client: Client,
  objectSet: unknown extends CompileTimeMetadata<Q>["objectSet"] ? ObjectSet<Q>
    : CompileTimeMetadata<Q>["objectSet"],
): Promise<string> {
  const response = await OntologyObjectSets.createTemporary(
    client,
    await client[additionalContext].gameStateId,
    {
      objectSet: getWireObjectSet(objectSet),
    },
  );
  return response.objectSetRid;
}
