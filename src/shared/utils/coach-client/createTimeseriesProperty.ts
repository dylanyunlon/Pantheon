/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon COACH architecture patterns.
 *
 *     Coach-advisor module for Pantheon (League of Legends assistant)
 *
 */

import type {
  TimeSeriesPoint,
  TimeSeriesProperty,
  TimeSeriesQuery,
} from "@shared/utils/coach-types";
import * as TimeSeriesPropertiesV2 from "@shared/utils/coach-types/TimeSeriesPropertyV2";
import type { MinimalClient } from "./MinimalClientContext.js";
import { asyncIterPointsHelper, getTimeRange } from "./util/timeseriesUtils.js";

export class TimeSeriesPropertyImpl<T extends number | string>
  implements TimeSeriesProperty<T>
{
  #triplet: [string, any, string];
  #client: MinimalClient;

  constructor(
    client: MinimalClient,
    objectApiName: string,
    primaryKey: any,
    propertyName: string,
  ) {
    this.#client = client;
    this.#triplet = [objectApiName, primaryKey, propertyName];
  }

  public async getFirstPoint(): Promise<TimeSeriesPoint<T>> {
    return TimeSeriesPropertiesV2.getFirstPoint(
      this.#client,
      await this.#client.ontologyRid,
      ...this.#triplet,
    ) as Promise<TimeSeriesPoint<T>>;
  }

  public async getLastPoint(): Promise<TimeSeriesPoint<T>> {
    return TimeSeriesPropertiesV2.getLastPoint(
      this.#client,
      await this.#client.ontologyRid,
      ...this.#triplet,
    ) as Promise<TimeSeriesPoint<T>>;
  }

  public async getAllPoints(
    query?: TimeSeriesQuery,
  ): Promise<TimeSeriesPoint<T>[]> {
    const allPoints: Array<TimeSeriesPoint<T>> = [];

    for await (const point of this.asyncIterPoints(query)) {
      allPoints.push(point);
    }
    return allPoints;
  }

  public async *asyncIterPoints(
    query?: TimeSeriesQuery,
  ): AsyncGenerator<
    {
      time: any;
      value: T;
    },
    void,
    unknown
  > {
    const streamPointsIterator = await TimeSeriesPropertiesV2
      .streamPoints(
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
