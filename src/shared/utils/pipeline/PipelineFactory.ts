/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon Pantheon architecture patterns.
 * 
 * 
 *
 *     Advisor module for Pantheon (League of Legends assistant)
 *
 * 
 * 
 * 
 * 
 * 
 */

import type { ObjectOrInterfaceDefinition, PipelineSet } from "../types";
import type { PipelineSet as WirePipelineSet } from "../types";
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
