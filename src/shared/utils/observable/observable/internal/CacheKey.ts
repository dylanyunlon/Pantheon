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

import type { Query } from "./Query";

export type CacheKey<
  X extends string = string,
  T_StoreValue = unknown,
  T_Query extends Query<any, any, any> = Query<any, any, any>,
  T_KeyFactoryArgs extends any[] = any[],
> = {
  type: X;
  otherKeys: T_KeyFactoryArgs;
  __cacheKey: {
    value: T_StoreValue;
    query: T_Query;
    args: T_KeyFactoryArgs;
  };
};

/**
 * This isn't performant and should only be used for debug logging!
 * @internal
 */
export function DEBUG_ONLY__cacheKeyToString(x: CacheKey) {
  if (process.env.NODE_ENV !== "production") {
    return `${x.type}CacheKey<${
      x.otherKeys.map(xx => JSON.stringify(xx)).join(", ")
    }>`.replaceAll("\"", "'");
  } else {
    throw new Error("not implemented");
  }
}
/**
 * This isn't performant and should only be used for debug logging!
 * @internal
 */
export function DEBUG_ONLY__cacheKeysToString(x: CacheKey[]) {
  if (process.env.NODE_ENV !== "production") {
    return "\n  - " + x.map(DEBUG_ONLY__cacheKeyToString).join("\n  - ");
  } else {
    throw new Error("not implemented");
  }
}
