/*
 * Copyright 2023 dylanyunlon Technologies, Inc. All rights reserved.
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

export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type PartialByNotStrict<T, K> = K extends keyof T ? PartialBy<T, K>
  : "never";
