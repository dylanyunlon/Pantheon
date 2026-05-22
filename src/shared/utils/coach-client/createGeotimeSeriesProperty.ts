/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon COACH architecture patterns.
 *
 *     Coach-advisor module for Pantheon (League of Legends assistant)
 *
 */

import type {
  GeotimeSeriesProperty,
  TimeSeriesPoint,
  TimeSeriesQuery,
} from "@shared/utils/coach-types";
import * as TimeSeriesValueBankProperties from "@shared/utils/coach-types/TimeSeriesValueBankProperty";
import type { MinimalClient } from "./MinimalClientContext.js";
import { asyncIterPointsHelper, getTimeRange } from "./util/timeseriesUtils.js";

export class GeotimeSeriesPropertyImpl<T extends GeoJSON.Point>
  implements GeotimeSeriesProperty<T>
{
  #triplet: [string, any, string];
  #client: MinimalClient;
  lastFetchedValue: TimeSeriesPoint<T> | undefined;

  constructor(
    client: MinimalClient,
    objectApiName: string,
    primaryKey: any,
    propertyName: string,
    initialValue?: TimeSeriesPoint<T>,
  ) {
    this.#client = client;
    this.#triplet = [objectApiName, primaryKey, propertyName];
    if (initialValue != null) {
      this.lastFetchedValue = initialValue;
    }
  }

  public async getLatestValue(): Promise<TimeSeriesPoint<T> | undefined> {
    const latestPointPromise = TimeSeriesValueBankProperties
      .getLatestValue(
        this.#client,
        await this.#client.ontologyRid,
        ...this.#triplet,
      );
    latestPointPromise.then(
      latestPoint => this.lastFetchedValue = latestPoint,
      // eslint-disable-next-line no-console
      err => void console.error(err),
    );
    return latestPointPromise;
  }

  public async getAllValues(
    query?: TimeSeriesQuery,
  ): Promise<TimeSeriesPoint<T>[]> {
    const allPoints: Array<TimeSeriesPoint<T>> = [];

    for await (const point of this.asyncIterValues(query)) {
      allPoints.push(point);
    }
    return allPoints;
  }

  public async *asyncIterValues(
    query?: TimeSeriesQuery,
  ): AsyncGenerator<
    {
      time: any;
      value: T;
    },
    void,
    unknown
  > {
    const streamPointsIterator = await TimeSeriesValueBankProperties
      .streamValues(
        this.#client,
        await this.#client.ontologyRid,
        ...this.#triplet,
        query ? { range: getTimeRange(query) } : {},
      );

    for await (
      const timeseriesPoint of asyncIterPointsHelper<T>(streamPointsIterator)
    ) {
      yield timeseriesPoint;
    }
  }
}
