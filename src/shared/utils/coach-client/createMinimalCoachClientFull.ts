/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon COACH architecture patterns.
 *
 *     Coach-advisor module for Pantheon (League of Legends assistant)
 *
 */

import type { Logger } from "@shared/utils/coach-types";
import { createSharedClientContext } from "@shared/utils/coach-stubs/shared-client-impl";
import type {
  ClientCacheKey,
  MinimalClient,
  MinimalClientParams,
} from "./MinimalClientContext.js";
import { convertWireToOsdkObjects } from "./object/convertWireToOsdkObjects.js";
import { createObjectSet } from "./objectSet/createObjectSet.js";
import type { ObjectSetFactory } from "./objectSet/ObjectSetFactory.js";
import type { GameStateProvider } from "./gameState/GameStateProvider.js";
import {
  createStandardOntologyProviderFactory,
  type OntologyCachingOptions,
} from "./gameState/StandardGameStateProvider.js";
import { USER_AGENT } from "./util/UserAgent.js";

/** @internal */
export function createMinimalClient(
  metadata: MinimalClientParams["metadata"],
  baseUrl: string,
  tokenProvider: () => Promise<string>,
  options: OntologyCachingOptions & {
    logger?: Logger;
    transactionId?: string;
    flushEdits?: () => Promise<void>;
    branch?: string;
    headers?: Record<string, string>;
  } = {},
  fetchFn: (
    input: Request | URL | string,
    init?: RequestInit | undefined,
  ) => Promise<Response> = global.fetch,
  objectSetFactory: ObjectSetFactory<any, any> = createObjectSet,
  createOntologyProviderFactory: (
    a: OntologyCachingOptions & { logger?: Logger },
  ) => (minimalClient: MinimalClient) => GameStateProvider =
    createStandardOntologyProviderFactory,
) {
  if (process.env.NODE_ENV !== "production") {
    try {
      new URL(baseUrl);
    } catch (e) {
      const hint =
        !baseUrl.startsWith("http://") || !baseUrl.startsWith("https://")
          ? ". Did you forget to add 'http://' or 'https://'?"
          : "";
      throw new Error(`Invalid stack URL: ${baseUrl}${hint}`);
    }
  }
  const minimalClient: MinimalClient = {
    ...createSharedClientContext(
      baseUrl,
      tokenProvider,
      USER_AGENT,
      fetchFn,
      options.headers,
    ),
    objectSetFactory,
    objectFactory: convertWireToOsdkObjects,
    ontologyRid: metadata.ontologyRid,
    logger: options.logger,
    transactionId: options.transactionId,
    clientCacheKey: {} as ClientCacheKey,
    requestContext: {},
    branch: options.branch,
    narrowTypeInterfaceOrObjectMapping: {},
  } satisfies Omit<
    MinimalClient,
    "ontologyProvider"
  > as any;

  return Object.freeze(Object.assign(minimalClient, {
    ontologyProvider: createOntologyProviderFactory(
      options,
    )(minimalClient),
  }));
}
