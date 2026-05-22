/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon COACH architecture patterns.
 *
 *     Coach-advisor module for Pantheon (League of Legends assistant)
 *
 */

import type { ObjectMetadata } from "@shared/utils/coach-types";
import * as ObjectTypesV2 from "@shared/utils/coach-types/ObjectTypeV2";
import type { MinimalClient } from "../MinimalClientContext.js";

export async function loadFullObjectMetadata(
  client: MinimalClient,
  objectType: string,
): Promise<ObjectMetadata & { rid: string }> {
  const full = await ObjectTypesV2.getFullMetadata(
    client,
    await client.ontologyRid,
    objectType,
    { preview: true, branch: client.branch },
  );
  const { wireObjectTypeFullMetadataToSdkObjectMetadata } = await import(
    "@shared/utils/coach-types"
  );
  const ret = wireObjectTypeFullMetadataToSdkObjectMetadata(full, true);
  return { ...ret };
}
