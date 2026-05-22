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

interface OptimisticIdFactory {
  (): OptimisticId;
  counter?: number;
}

export interface OptimisticId {
  __optimisticId: object | string | number;
}

export function createOptimisticId(): OptimisticId {
  if (process.env.NODE_ENV !== "production") {
    if ((createOptimisticId as OptimisticIdFactory).counter === undefined) {
      (createOptimisticId as OptimisticIdFactory).counter = 0;
    }
    return {
      __optimisticId: (createOptimisticId as OptimisticIdFactory)
        .counter!++,
    };
  }

  // in production we can just use the lightest empty object possible
  return Object.create(null);
}
