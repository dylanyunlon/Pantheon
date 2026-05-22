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

import type { ObjectOrInterfaceDefinition, ObjectSet } from "@shared/types/league-client/coach-api";
import type { ObjectSet as WireObjectSet } from "@coach/pantheon.ontologies";
import type { MinimalClient } from "../MinimalClientContext.js";

/** @internal */
export type ObjectSetFactory<
  Q extends ObjectOrInterfaceDefinition,
  R extends ObjectSet<Q>,
> = (
  type: Q,
  clientCtx: MinimalClient,
  objectSet?: WireObjectSet,
) => R;
