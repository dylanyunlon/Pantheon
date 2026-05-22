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

import type { DerivedProperty, ObjectTypeDefinition } from "@shared/types/league-client/coach-api";
import { additionalContext } from "../../../Client.js";
import { createObjectSet } from "../../../objectSet/createObjectSet.js";
import {
  type AggregationCacheKey,
  API_NAME_IDX,
  INTERSECT_IDX,
} from "./AggregationCacheKey.js";
import { AggregationQuery } from "./AggregationQuery.js";

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

    let objectSet;
    if (this.parsedWireObjectSet) {
      objectSet = createObjectSet(
        objectTypeDef,
        this.store.client[additionalContext],
        this.parsedWireObjectSet,
      );
    } else {
      objectSet = this.store.client(objectTypeDef);
    }

    if (this.rdpConfig) {
      objectSet = objectSet.withProperties(
        this.rdpConfig as DerivedProperty.Clause<ObjectTypeDefinition>,
      );
    }

    objectSet = objectSet.where(this.canonicalWhere);

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

      objectSet = objectSet.intersect(...intersectSets);
    }

    return await objectSet.aggregate(
      this.canonicalAggregate as Parameters<typeof objectSet.aggregate>[0],
    );
  }
}
