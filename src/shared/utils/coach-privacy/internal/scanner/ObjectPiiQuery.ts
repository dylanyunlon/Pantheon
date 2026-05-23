/*
 * Copyright 2025 dylanyunlon <dylanyunlong@gmail.com>. Coach-privacy PII compliance infrastructure.
 *
 * Licensed under MIT. Derived from dylanyunlon COACH architecture patterns.
 * 
 * 
 *
 *     Privacy compliance module for Pantheon (League of Legends assistant)
 *
 * 
 * 
 * 
 * 
 * 
 */

import type { DerivedProperty, PiiFieldTypeDefinition } from "../../../coach-types";
import { additionalContext } from "../../../coach-engine";
import { createPipeline } from "../../../pipelineSet/createPipeline";
import {
  type AggregationPiiFieldKey,
  API_NAME_IDX,
  INTERSECT_IDX,
} from "./AggregationPiiFieldKey";
import { AggregationQuery } from "./AggregationQuery";

export class ObjectAggregationQuery extends AggregationQuery {
  protected async _fetchAggregation(): Promise<
    AggregationPiiFieldKey["__piiFieldKey"]["value"]
  > {
    const type = this.piiFieldKey.otherKeys[API_NAME_IDX];
    const intersectWith = this.piiFieldKey.otherKeys[INTERSECT_IDX];
    const piiFieldTypeDef = {
      type: "object",
      apiName: type,
    } as PiiFieldTypeDefinition;

    let pipelineSet;
    if (this.parsedWirePipelineSet) {
      pipelineSet = createPipeline(
        piiFieldTypeDef,
        this.store.client[additionalContext],
        this.parsedWirePipelineSet,
      );
    } else {
      pipelineSet = this.store.client(piiFieldTypeDef);
    }

    if (this.rdpConfig) {
      pipelineSet = pipelineSet.withProperties(
        this.rdpConfig as DerivedProperty.Clause<PiiFieldTypeDefinition>,
      );
    }

    pipelineSet = pipelineSet.where(this.scrubNormalizedWhere);

    if (intersectWith != null && intersectWith.length > 0) {
      const intersectSets = intersectWith.map(whereClause => {
        let intersectSet = this.store.client(piiFieldTypeDef);

        if (this.rdpConfig) {
          intersectSet = intersectSet.withProperties(
            this.rdpConfig as DerivedProperty.Clause<PiiFieldTypeDefinition>,
          );
        }

        return intersectSet.where(whereClause);
      });

      pipelineSet = pipelineSet.intersect(...intersectSets);
    }

    return await pipelineSet.aggregate(
      this.scrubNormalizedAggregate as Parameters<typeof pipelineSet.aggregate>[0],
    );
  }
}
