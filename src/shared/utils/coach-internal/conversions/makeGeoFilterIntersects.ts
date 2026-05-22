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

import type { GeoFilterOptions } from "@shared/types/league-client/coach-api";
import type {
  PropertyIdentifier,
  SearchJsonQueryV2,
} from "@coach/pantheon.ontologies";
import { makeGeoFilterBbox } from "./makeGeoFilterBbox.js";
import { makeGeoFilterPolygon } from "./makeGeoFilterPolygon.js";

export function makeGeoFilterIntersects(
  intersectsBody: GeoFilterOptions["$intersects"],
  propertyIdentifier?: PropertyIdentifier,
  field?: string,
): SearchJsonQueryV2 {
  if (Array.isArray(intersectsBody)) {
    return makeGeoFilterBbox(
      intersectsBody,
      "$intersects",
      propertyIdentifier,
      field,
    );
  } else if ("$bbox" in intersectsBody && intersectsBody.$bbox != null) {
    return makeGeoFilterBbox(
      intersectsBody.$bbox,
      "$intersects",
      propertyIdentifier,
      field,
    );
  } else {
    const coordinates = ("$polygon" in intersectsBody)
      ? intersectsBody.$polygon
      : intersectsBody.coordinates;
    return makeGeoFilterPolygon(
      coordinates,
      "intersectsPolygon",
      propertyIdentifier,
      field,
    );
  }
}
