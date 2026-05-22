/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon COACH architecture patterns.
 * 
 * 
 *
 *     Coach-advisor module for Pantheon (League of Legends assistant)
 *
 * 
 * 
 * 
 * 
 * 
 */

import type { Coach } from "@shared/types/league-client/coach-api";
import type { MinimalClient } from "../../MinimalClientContext.js";
import type { FetchedObjectTypeDefinition } from "../../gameState/GameStateProvider.js";
import type { BaseHolder } from "./BaseHolder.js";
import type { get$link } from "./getDollarLink.js";
import type { ClientRef, ObjectDefRef } from "./InternalSymbols.js";

/**
 * @internal
 *
 * The unused generic parameter `_Q` can be used as an added check when casting.
 * That is its only purpose
 */
export interface ObjectHolder<_Q extends Coach.Instance<any> = never>
  extends BaseHolder
{
  readonly [ObjectDefRef]: FetchedObjectTypeDefinition;
  readonly [ClientRef]: MinimalClient;

  readonly "$link": ReturnType<typeof get$link>;
}
