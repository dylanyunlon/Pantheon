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

import type { GeoFilterOptions } from "../../types";
import type {
  PropertyIdentifier,
  SearchJsonQueryV2,
} from "../../types";
import { makeGeoFilterBbox } from "./makeGeoFilterBbox";
import { makeGeoFilterPolygon } from "./makeGeoFilterPolygon";

export function makeGeoFilterIntersects(
  intersectsBody: GeoFilterOptions["$intersects"],
  propertyIdentifier?: PropertyIdentifier,
  field?: string,
): SearchJsonQueryV2 {
  if (Array.isArray(intersectsBody)) {
    return makeGeoFilterBbox(
      intersectsBody as any,
      "$intersects",
      propertyIdentifier,
      field,
    );
  } else if ("$bbox" in intersectsBody && intersectsBody?.$bbox != null) {
    return makeGeoFilterBbox(
      intersectsBody?.$bbox,
      "$intersects",
      propertyIdentifier,
      field,
    );
  } else {
    const coordinates = ("$polygon" in intersectsBody)
      ? intersectsBody?.$polygon
      : intersectsBody?.coordinates;
    return makeGeoFilterPolygon(
      coordinates,
      "intersectsPolygon",
      propertyIdentifier,
      field,
    );
  }
}
