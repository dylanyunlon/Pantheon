/*
 * Copyright 2025 dylanyunlon <dylanyunlong@gmail.com>. Coach-advisor infrastructure.
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

import type { CacheKey } from "../CacheKey";
import type { Canonical } from "../Canonical";
import type { CanonicalFunctionParams } from "./FunctionParamsCanonicalizer";
import type { FunctionQuery } from "./FunctionQuery";

// Index constants for accessing otherKeys array elements
export const API_NAME_IDX = 0;
export const VERSION_IDX = 1;
export const PARAMS_IDX = 2;

/**
 * Cache values use `unknown` because FunctionQuery handles any QueryDefinition at runtime.
 * Concrete typing is preserved at the API layer via generics and cast at output.
 */
export interface FunctionCacheValue {
  result: unknown;
  executedAt: number;
  error?: Error;
}

export interface FunctionCacheKey extends
  CacheKey<
    "function",
    FunctionCacheValue,
    FunctionQuery,
    [
      apiName: string,
      version: string | undefined,
      canonicalParams: Canonical<CanonicalFunctionParams> | undefined,
    ]
  >
{}
