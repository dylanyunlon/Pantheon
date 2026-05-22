/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon COACH architecture patterns.
 *
 *     Coach-advisor module for Pantheon (League of Legends assistant)
 *
 */

import { createSharedClientContext } from "@shared/utils/coach-stubs/shared-client-impl";
import type { SharedClientContext } from "@shared/utils/coach-stubs/shared-client-impl";
import { USER_AGENT } from "./util/UserAgent.js";

export interface PlatformClient extends SharedClientContext {}

/**
 * Creates a client that can only be used with Platform APIs.
 *
 * If you already have an COACH Client (from `createClient`), you do not need to
 * create one of these - those clients can be used with Platform APIs as well.
 *
 * @param options - Currently unused, reserved for future use.
 */
export function createPlatformClient(
  baseUrl: string,
  tokenProvider: () => Promise<string>,
  options: undefined = undefined,
  fetchFn: typeof globalThis.fetch = fetch,
): PlatformClient {
  return createSharedClientContext(
    baseUrl,
    tokenProvider,
    USER_AGENT,
    fetchFn,
  );
}
