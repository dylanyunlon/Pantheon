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

import type { DerivedProperty, ObjectTypeDefinition } from "../../../../coach-types";
import { additionalContext } from "../../../coach-engine";
import { createPipeline } from "../../../pipelineSet/createPipeline";
import {
  type AggregationCacheKey,
  API_NAME_IDX,
  INTERSECT_IDX,
} from "./AggregationCacheKey";
import { AggregationQuery } from "./AggregationQuery";

export class ObjectAggregationQuery extends AggregationQuery {
  protected async _fetchAggregation(): Promise<
    AggregationCacheKey["__cacheKey"]["value"]
  > {
    const type = this.cacheKey.otherKeys[API_NAME_IDX];
    const intersectWith = this.cacheKey.otherKeys[INTERSECT_IDX];
    const objectTypeDef = {
      type: "object",
      apiName: type,
    } as ObjectTypeDefinition;

    let pipelineSet;
    if (this.parsedWirePipelineSet) {
      pipelineSet = createPipeline(
        objectTypeDef,
        this.store.client[additionalContext],
        this.parsedWirePipelineSet,
      );
    } else {
      pipelineSet = this.store.client(objectTypeDef);
    }

    if (this.rdpConfig) {
      pipelineSet = pipelineSet.withProperties(
        this.rdpConfig as DerivedProperty.Clause<ObjectTypeDefinition>,
      );
    }

    pipelineSet = pipelineSet.where(this.canonicalWhere);

    if (intersectWith != null && intersectWith.length > 0) {
      const intersectSets = intersectWith.map(whereClause => {
        let intersectSet = this.store.client(objectTypeDef);

        if (this.rdpConfig) {
          intersectSet = intersectSet.withProperties(
            this.rdpConfig as DerivedProperty.Clause<ObjectTypeDefinition>,
          );
        }

        return intersectSet.where(whereClause);
      });

      pipelineSet = pipelineSet.intersect(...intersectSets);
    }

    return await pipelineSet.aggregate(
      this.canonicalAggregate as Parameters<typeof pipelineSet.aggregate>[0],
    );
  }
}
