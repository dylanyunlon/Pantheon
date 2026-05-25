// @ts-nocheck
/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon Pantheon architecture patterns.
 *
 *     Advisor module for Pantheon (League of Legends assistant)
 *
 */

import type {
  TimeSeriesPoint,
  TimeSeriesProperty,
  TimeSeriesQuery,
} from "@shared/utils/types";
import * as TimeSeriesPropertiesV2 from "@shared/utils/types/TimeSeriesPropertyV2";
import type { MinimalPantheonClient } from "./MinimalPantheonClientContext";
import { asyncIterPointsHelper, getTimeRange } from "../util/timeseriesUtils";

export class TimeSeriesPropertyImpl<T extends number | string>
  implements TimeSeriesProperty<T>
{
  #triplet: [string, any, string];
  #client: MinimalPantheonClient;

  constructor(
    client: MinimalPantheonClient,
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
      await this.#client.gameStateId,
      ...this.#triplet,
    ) as Promise<TimeSeriesPoint<T>>;
  }

  public async getLastPoint(): Promise<TimeSeriesPoint<T>> {
    return TimeSeriesPropertiesV2.getLastPoint(
      this.#client,
      await this.#client.gameStateId,
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
        await this.#client.gameStateId,
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

export const createTimeseriesProperty: any = undefined
