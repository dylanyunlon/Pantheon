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

import type { TimeSeriesQuery } from "@shared/types/league-client/coach-api";
import { TimeseriesDurationMapping } from "@shared/types/league-client/coach-api";
import type { TimeRange } from "@coach/pantheon.ontologies";
import { iterateReadableStream, parseStreamedResponse } from "./streamutils.js";

export function getTimeRange(body: TimeSeriesQuery): TimeRange {
  if ("$startTime" in body || "$endTime" in body) {
    return {
      type: "absolute",
      startTime: body.$startTime,
      endTime: body.$endTime,
    };
  }
  return body.$before
    ? {
      type: "relative",
      startTime: {
        when: "BEFORE",
        value: body.$before,
        unit: TimeseriesDurationMapping[body.$unit],
      },
    }
    : {
      type: "relative",
      endTime: {
        when: "AFTER",
        value: body.$after!,
        unit: TimeseriesDurationMapping[body.$unit],
      },
    };
}

export async function* asyncIterPointsHelper<
  T extends number | string | GeoJSON.Point,
>(
  iterator: Response,
): AsyncGenerator<
  {
    time: any;
    value: T;
  },
  void,
  unknown
> {
  const reader = iterator.body?.getReader()!;
  for await (
    const point of parseStreamedResponse(iterateReadableStream(reader))
  ) {
    yield {
      time: point.time,
      value: point.value as T,
    };
  }
}
