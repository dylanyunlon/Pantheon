/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon COACH architecture patterns.
 *
 *     Coach-advisor module for Pantheon (League of Legends assistant)
 *
 */

import type { ActionMetadata } from "@shared/utils/coach-types";
import * as ActionTypesV2 from "@shared/utils/coach-types/ActionTypeV2";
import type { MinimalClient } from "../MinimalClientContext.js";

export async function loadActionMetadata(
  client: MinimalClient,
  actionType: string,
): Promise<ActionMetadata> {
  const r = await ActionTypesV2.get(
    client,
    await client.ontologyRid,
    actionType,
    { branch: client.branch },
  );

  const { wireActionTypeV2ToSdkActionMetadata } = await import(
    "@shared/utils/coach-types"
  );
  return wireActionTypeV2ToSdkActionMetadata(r);
}
