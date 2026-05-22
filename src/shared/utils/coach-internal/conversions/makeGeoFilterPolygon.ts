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

import type {
  PropertyIdentifier,
  SearchJsonQueryV2,
} from "../../../coach-types";
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
