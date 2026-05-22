/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
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

type DeepWriteable<T> = {
  -readonly [P in keyof T]: DeepWriteable<T[P]>;
};

/**
 * Helper function that creates the shape of a lcuBridge union in fewer bytes than manually declaring it (when compressed)
 *
 * e.g `{type:"base",base:{foo:5}}` becomes `a("base",{foo:5})`
 */
export function conjureUnionType<T extends string, const V>(
  type: T,
  value: V,
): { type: T } & Record<T, DeepWriteable<V>> {
  return {
    type,
    [type]: value,
  } as { type: T } & Record<T, V>;
}
