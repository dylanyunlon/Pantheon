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

import type { ObjectOrInterfaceDefinition, PipelineSet } from "../coach-types";
import type { PipelineSet as WirePipelineSet } from "../coach-types";
import type { MinimalClient } from "../MinimalClientContext";

/** @internal */
export type PipelineFactory<
  Q extends ObjectOrInterfaceDefinition,
  R extends PipelineSet<Q>,
> = (
  type: Q,
  clientCtx: MinimalClient,
  pipelineSet?: WirePipelineSet,
) => R;
