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

import type {
  PropertyIdentifier,
  SearchJsonQueryV2,
} from "../../types";
import type { Position } from "geojson";

export function makeGeoFilterPolygon(
  coordinates: Position[][],
  filterType: "intersectsPolygon" | "withinPolygon",
  propertyIdentifier?: PropertyIdentifier,
  field?: string,
): SearchJsonQueryV2 {
  return {
    type: filterType,
    ...(propertyIdentifier != null && { propertyIdentifier }),
    field,
    value: {
      type: "Polygon",
      coordinates,
    },
  };
}
