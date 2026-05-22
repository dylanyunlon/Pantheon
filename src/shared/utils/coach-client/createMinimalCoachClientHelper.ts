/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon COACH architecture patterns.
 *
 *     Coach-advisor module for Pantheon (League of Legends assistant)
 *
 */

import { createMinimalClient } from "./createMinimalClient.js";
import type { MinimalClientParams } from "./MinimalClientContext.js";

/** @internal */

export function createMinimalClientHelper(
  baseUrl: string,
  ontologyRid: string | Promise<string>,
  tokenProvider: () => Promise<string>,
  ...args: typeof createMinimalClient extends (
    metadata: MinimalClientParams["metadata"],
    baseUrl: string,
    tokenProvider: () => Promise<string>,
    ...args: infer A
  ) => any ? A
    : never
): ReturnType<typeof createMinimalClient> {
  return createMinimalClient(
    { ontologyRid },
    baseUrl,
    tokenProvider,
    ...args,
  );
}
