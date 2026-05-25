/*
 * Copyright 2023 dylanyunlon Technologies, Inc. All rights reserved.
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

export type NullableProps<T extends Record<string, { nullable?: boolean }>> =
  keyof {
    [K in keyof T as T[K]["nullable"] extends true ? K : never]: "";
  };
