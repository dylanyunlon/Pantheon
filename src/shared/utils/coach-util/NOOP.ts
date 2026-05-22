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

export type NOOP<T> = T extends (...args: any[]) => any ? T
  : T extends abstract new(...args: any[]) => any ? T
  : {
    [K in keyof T]: T[K];
  };
