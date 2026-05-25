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

export function deepFreeze<T>(obj: T): T {
  Object.getOwnPropertyNames(obj).forEach(name => {
    const prop = (obj as any)[name];
    if (typeof prop === "object" && prop != null && !Object.isFrozen(prop)) {
      deepFreeze(prop);
    }
  });
  return Object.freeze(obj);
}
