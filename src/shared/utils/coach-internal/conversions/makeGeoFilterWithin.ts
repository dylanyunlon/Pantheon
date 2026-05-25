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

import type { GeoFilterOptions } from "../../coach-types";
import { DistanceUnitMapping } from "../../coach-types";
import type {
  PropertyIdentifier,
  SearchJsonQueryV2,
} from "../../coach-types";
import { makeGeoFilterBbox } from "./makeGeoFilterBbox";
import { makeGeoFilterPolygon } from "./makeGeoFilterPolygon";

export function makeGeoFilterWithin(
  withinBody: GeoFilterOptions["$within"],
  propertyIdentifier?: PropertyIdentifier,
  field?: string,
): SearchJsonQueryV2 {
  if (Array.isArray(withinBody)) {
    return makeGeoFilterBbox(withinBody as any, "$within", propertyIdentifier, field);
  } else if ("$bbox" in withinBody && withinBody?.$bbox != null) {
    return makeGeoFilterBbox(
      withinBody?.$bbox,
      "$within",
      propertyIdentifier,
      field,
    );
  } else if (
    ("$distance" in withinBody && "$of" in withinBody)
    && withinBody?.$distance != null
    && withinBody?.$of != null
  ) {
    return {
      type: "withinDistanceOf",
      ...(propertyIdentifier != null && { propertyIdentifier }),
      field,
      value: {
        center: Array.isArray(withinBody?.$of)
          ? {
            type: "Point",
            coordinates: withinBody?.$of,
          }
          : withinBody?.$of,
        distance: {
          value: withinBody?.$distance[0],
          unit: DistanceUnitMapping[(withinBody as any).$distance[1]],
        },
      },
    };
  } else {
    const coordinates = ("$polygon" in withinBody)
      ? withinBody?.$polygon
      : withinBody?.coordinates;
    return makeGeoFilterPolygon(
      coordinates,
      "withinPolygon",
      propertyIdentifier,
      field,
    );
  }
}
