// @ts-nocheck
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

export function isPoint(o: any): o is GeoJSON.Point {
  return o && typeof o === "object" && "type" in o && o.type === "Point"
    && "coordinates" in o && o.coordinates.length === 2;
}
