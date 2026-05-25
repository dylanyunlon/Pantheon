/*
 * Copyright 2025 dylanyunlon <dylanyunlong@gmail.com>. Advisor infrastructure.
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

import type { PipelineSet } from "../../types";
import type { BaseCollectionPayload } from "./internal/base-list/BaseCollectionQuery";

export interface ObjectSetPayload extends BaseCollectionPayload {
  pipelineSet: PipelineSet<any, any>;
}
