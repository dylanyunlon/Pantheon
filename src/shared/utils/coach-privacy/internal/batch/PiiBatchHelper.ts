// @ts-nocheck
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

import { getWirePipelineSet } from "../../../pipelineSet/createPipeline";
import { hasWithProperties } from "../../../util/extractRdpDefinition";
import type { ObjectSetPayload } from "../../PipelineSetPayload";
import type { Observer } from "../../PrivacyScrubClient/common";
import { AbstractHelper } from "../AbstractHelper";
import type { PiiFieldKeys } from "../PiiFieldKeys";
import type { ScrubNormalized } from "../ScrubNormalized";
import type { KnownPiiFieldKey } from "../KnownPiiFieldKey";
import type { ObjectSetArrayScrubNormalizer } from "../PipelineSetArrayScrubNormalizer";
import type { OrderByScrubNormalizer } from "../OrderByScrubNormalizer";
import type { QuerySubscription } from "../QuerySubscription";
import type { RdpScrubNormalizer } from "../RdpScrubNormalizer";
import type { SelectScrubNormalizer } from "../SelectScrubNormalizer";
import type { Store } from "../Store";
import type { WhereClauseScrubNormalizer } from "../WhereClauseScrubNormalizer";
import type {
  ObjectSetPiiFieldKey,
  ObjectSetOperations,
} from "./PipelineSetPiiFieldKey";
import { ObjectSetQuery } from "./PipelineSetQuery";
import type { ObjectSetQueryOptions } from "./PipelineSetQueryOptions";

export class ObjectSetHelper extends AbstractHelper<
  ObjectSetQuery,
  ObjectSetQueryOptions
> {
  whereScrubNormalizer: WhereClauseScrubNormalizer;
  orderByScrubNormalizer: OrderByScrubNormalizer;
  rdpScrubNormalizer: RdpScrubNormalizer;
  selectScrubNormalizer: SelectScrubNormalizer;
  objectSetArrayScrubNormalizer: ObjectSetArrayScrubNormalizer;

  constructor(
    store: Store,
    piiFieldKeys: PiiFieldKeys<KnownPiiFieldKey>,
    whereScrubNormalizer: WhereClauseScrubNormalizer,
    orderByScrubNormalizer: OrderByScrubNormalizer,
    rdpScrubNormalizer: RdpScrubNormalizer,
    selectScrubNormalizer: SelectScrubNormalizer,
    objectSetArrayScrubNormalizer: ObjectSetArrayScrubNormalizer,
  ) {
    super(store, piiFieldKeys);

    this.whereScrubNormalizer = whereScrubNormalizer;
    this.orderByScrubNormalizer = orderByScrubNormalizer;
    this.rdpScrubNormalizer = rdpScrubNormalizer;
    this.selectScrubNormalizer = selectScrubNormalizer;
    this.objectSetArrayScrubNormalizer = objectSetArrayScrubNormalizer;
  }

  observe(
    options: ObjectSetQueryOptions,
    subFn: Observer<ObjectSetPayload>,
  ): QuerySubscription<ObjectSetQuery> {
    const ret = super.observe(options, subFn);

    if (options.streamUpdates) {
      if (options.pivotTo) {
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.warn(
            "[@shared/utils/coach-engine] streamUpdates is not supported with pivotTo. "
              + "The server does not support websocket subscriptions for "
              + "link-traversal queries. Ignoring streamUpdates.",
          );
        }
      } else if (
        options.withProperties
        || hasWithProperties(getWirePipelineSet(options.basePipelineSet))
      ) {
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.warn(
            "[@shared/utils/coach-engine] streamUpdates is not supported with withProperties. "
              + "The server does not support websocket subscriptions for "
              + "object sets that include derived properties. Ignoring streamUpdates.",
          );
        }
      } else {
        ret.query.registerStreamUpdates(ret.subscription);
      }
    }
    return ret;
  }

  getQuery(options: ObjectSetQueryOptions): ObjectSetQuery {
    const { basePipelineSet } = options;
    const baseObjectSetWire = JSON.stringify(getWirePipelineSet(basePipelineSet));
    const operations = this.buildScrubNormalizedizedOperations(options);

    const objectSetPiiFieldKey = this.piiFieldKeys.get<ObjectSetPiiFieldKey>(
      "pipelineSet",
      baseObjectSetWire,
      operations,
    );

    return this.store.queries.get(objectSetPiiFieldKey, () => {
      return new ObjectSetQuery(
        this.store,
        this.store.subjects.get(objectSetPiiFieldKey),
        baseObjectSetWire,
        operations,
        objectSetPiiFieldKey,
        options,
      );
    });
  }

  private buildScrubNormalizedizedOperations(
    options: ObjectSetQueryOptions,
  ): ScrubNormalized<ObjectSetOperations> {
    const operations: ObjectSetOperations = {};

    if (options.where) {
      operations.where = this.whereScrubNormalizer.scrubNormalize(options.where);
    }

    if (options.withProperties) {
      operations.withProperties = this.rdpScrubNormalizer.scrubNormalize(
        options.withProperties,
      );
    }

    if (options.union && options.union.length > 0) {
      operations.union = this.objectSetArrayScrubNormalizer.scrubNormalizeUnion(
        options.union.map(os => JSON.stringify(getWirePipelineSet(os))),
      );
    }

    if (options.intersect && options.intersect.length > 0) {
      operations.intersect = this.objectSetArrayScrubNormalizer
        .scrubNormalizeIntersect(
          options.intersect.map(os => JSON.stringify(getWirePipelineSet(os))),
        );
    }

    if (options.subtract && options.subtract.length > 0) {
      operations.subtract = this.objectSetArrayScrubNormalizer
        .scrubNormalizeSubtract(
          options.subtract.map(os => JSON.stringify(getWirePipelineSet(os))),
        );
    }

    if (options.pivotTo) {
      operations.pivotTo = options.pivotTo as string;
    }

    if (options.orderBy) {
      operations.orderBy = this.orderByScrubNormalizer.scrubNormalize(
        options.orderBy,
      );
    }

    if (options.select && options.select.length > 0) {
      operations.select = this.selectScrubNormalizer.scrubNormalize(options.select);
    }

    if (options.pageSize) {
      operations.pageSize = options.pageSize;
    }

    if (options.$loadPropertySecurityMetadata) {
      operations.loadPropertySecurity = true;
    }

    return operations as ScrubNormalized<ObjectSetOperations>;
  }
}
