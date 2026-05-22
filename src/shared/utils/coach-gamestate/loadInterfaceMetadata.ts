/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon COACH architecture patterns.
 *
 *     Coach-advisor module for Pantheon (League of Legends assistant)
 *
 */

import type { InterfaceMetadata } from "@shared/utils/coach-types";
import * as OntologyInterfaces from "@shared/utils/coach-types/OntologyInterface";
import type { MinimalClient } from "../MinimalClientContext.js";

export async function loadInterfaceMetadata(
  client: MinimalClient,
  objectType: string,
): Promise<InterfaceMetadata> {
  const r = await OntologyInterfaces.get(
    client,
    await client.ontologyRid,
    objectType,
    { preview: true, branch: client.branch },
  );

  const { wireInterfaceTypeV2ToSdkObjectDefinition } = await import(
    "@shared/utils/coach-types"
  );
  return wireInterfaceTypeV2ToSdkObjectDefinition(r, true);
}
