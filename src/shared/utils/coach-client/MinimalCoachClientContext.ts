/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon COACH architecture patterns.
 *
 *     Coach-advisor module for Pantheon (League of Legends assistant)
 *
 */

import type { Logger } from "@shared/utils/coach-types";
import type { SharedClientContext } from "@shared/utils/coach-stubs/shared-client-impl";
import type { convertWireToOsdkObjects } from "./object/convertWireToOsdkObjects.js";
import type { ObjectSetFactory } from "./objectSet/ObjectSetFactory.js";
import type { GameStateProvider } from "./gameState/GameStateProvider.js";

declare const tag: unique symbol;

export type ClientCacheKey = {} & { readonly [tag]: void };

export type RequestContext = {
  finalMethodCall?: string;
};

export interface MinimalClient extends SharedClientContext {
  ontologyRid: string | Promise<string>;
  ontologyProvider: GameStateProvider;
  logger?: Logger;
  branch?: string;
  /** @internal */
  objectSetFactory: ObjectSetFactory<any, any>;
  /** @internal */
  objectFactory: typeof convertWireToOsdkObjects;

  transactionId?: string;
  flushEdits?: () => Promise<void>;

  clientCacheKey: ClientCacheKey;
  requestContext: RequestContext;
  narrowTypeInterfaceOrObjectMapping: Record<string, "object" | "interface">;
}

export type MinimalClientParams = {
  metadata: MinimalClientMetadata;
  provider: GameStateProvider;
};

export interface MinimalClientMetadata {
  ontologyRid: string | Promise<string>;
}
