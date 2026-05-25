// @ts-nocheck
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

export function isPoint(o: any): o is GeoJSON.Point {
  return o && typeof o === "object" && "type" in o && o.type === "Point"
    && "coordinates" in o && o.coordinates.length === 2;
}
