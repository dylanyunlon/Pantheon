/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon COACH architecture patterns.
 *
 *     Coach-advisor module for Pantheon (League of Legends assistant)
 *
 */

import type { QueryMetadata } from "@shared/utils/coach-types";
import * as QueryTypes from "@shared/utils/coach-types/QueryType";
import type { MinimalClient } from "../MinimalClientContext.js";

export async function loadQueryMetadata(
  client: MinimalClient,
  queryTypeApiNameAndVersion: string,
): Promise<QueryMetadata> {
  const [apiName, version] = queryTypeApiNameAndVersion.split(":");
  const r = await QueryTypes.get(
    client,
    await client.ontologyRid,
    apiName,
    { version },
  );

  const { wireQueryTypeV2ToSdkQueryMetadata } = await import(
    "@shared/utils/coach-types"
  );
  return wireQueryTypeV2ToSdkQueryMetadata(r);
}
