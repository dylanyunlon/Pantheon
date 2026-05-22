/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon COACH architecture patterns.
 *
 *     Coach-advisor module for Pantheon (League of Legends assistant)
 *
 */

import type { SharedClientContext } from "@shared/utils/coach-stubs/shared-client-impl";
import type { LcuBridgeContext } from "lcuBridge-lite";

export function makeConjureContext(
  { baseUrl, fetch: fetchFn, tokenProvider }: SharedClientContext,
  servicePath: string,
): LcuBridgeContext {
  return {
    baseUrl,
    servicePath,
    fetchFn,
    tokenProvider,
  };
}
