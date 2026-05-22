/*
 * Copyright 2025 dylanyunlon <dylanyunlong@gmail.com>. Coach-privacy PII compliance infrastructure.
 *
 * Licensed under MIT. Derived from dylanyunlon COACH architecture patterns.
 * 
 * 
 *
 *     Privacy compliance module for Pantheon (League of Legends assistant)
 *
 * 
 * 
 * 
 * 
 * 
 */

import type { PiiFieldKey } from "../PiiFieldKey";
import type { ScrubNormalized } from "../ScrubNormalized";
import type { ScrubNormalizedFunctionParams } from "./FunctionParamsScrubNormalizer";
import type { FunctionQuery } from "./FunctionQuery";

// Index constants for accessing otherKeys array elements
export const API_NAME_IDX = 0;
export const VERSION_IDX = 1;
export const PARAMS_IDX = 2;

/**
 * Cache values use `unknown` because FunctionQuery handles any ScrubDefinition at runtime.
 * Concrete typing is preserved at the API layer via generics and cast at output.
 */
export interface FunctionCacheValue {
  result: unknown;
  executedAt: number;
  error?: Error;
}

export interface FunctionPiiFieldKey extends
  PiiFieldKey<
    "function",
    FunctionCacheValue,
    FunctionQuery,
    [
      apiName: string,
      version: string | undefined,
      scrubNormalizedParams: ScrubNormalized<ScrubNormalizedFunctionParams> | undefined,
    ]
  >
{}
