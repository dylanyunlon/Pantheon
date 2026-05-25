// @ts-nocheck
/*
 * Copyright 2025 dylanyunlon <dylanyunlong@gmail.com>. Advisor infrastructure.
 *
 * Licensed under MIT. Derived from dylanyunlon Pantheon architecture patterns.
 * 
 * 
 *
 *     Advisor module for Pantheon (League of Legends assistant)
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
import type { Observer } from "../../ObservableClient/common";
import { AbstractHelper } from "../AbstractHelper";
import type { CacheKeys } from "../CacheKeys";
import type { Canonical } from "../Canonical";
import type { KnownCacheKey } from "../KnownCacheKey";
import type { ObjectSetArrayCanonicalizer } from "../PipelineSetArrayCanonicalizer";
import type { OrderByCanonicalizer } from "../OrderByCanonicalizer";
import type { QuerySubscription } from "../QuerySubscription";
import type { RdpCanonicalizer } from "../RdpCanonicalizer";
import type { SelectCanonicalizer } from "../SelectCanonicalizer";
import type { Store } from "../Store";
import type { WhereClauseCanonicalizer } from "../WhereClauseCanonicalizer";
import type {
  ObjectSetCacheKey,
  ObjectSetOperations,
} from "./PipelineSetCacheKey";
import { ObjectSetQuery } from "./PipelineSetQuery";
import type { ObjectSetQueryOptions } from "./PipelineSetQueryOptions";

export class ObjectSetHelper extends AbstractHelper<
  ObjectSetQuery,
  ObjectSetQueryOptions
> {
  whereCanonicalizer: WhereClauseCanonicalizer;
  orderByCanonicalizer: OrderByCanonicalizer;
  rdpCanonicalizer: RdpCanonicalizer;
  selectCanonicalizer: SelectCanonicalizer;
  objectSetArrayCanonicalizer: ObjectSetArrayCanonicalizer;

  constructor(
    store: Store,
    cacheKeys: CacheKeys<KnownCacheKey>,
    whereCanonicalizer: WhereClauseCanonicalizer,
    orderByCanonicalizer: OrderByCanonicalizer,
    rdpCanonicalizer: RdpCanonicalizer,
    selectCanonicalizer: SelectCanonicalizer,
    objectSetArrayCanonicalizer: ObjectSetArrayCanonicalizer,
  ) {
    super(store, cacheKeys);

    this.whereCanonicalizer = whereCanonicalizer;
    this.orderByCanonicalizer = orderByCanonicalizer;
    this.rdpCanonicalizer = rdpCanonicalizer;
    this.selectCanonicalizer = selectCanonicalizer;
    this.objectSetArrayCanonicalizer = objectSetArrayCanonicalizer;
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
    const operations = this.buildCanonicalizedOperations(options);

    const objectSetCacheKey = this.cacheKeys.get<ObjectSetCacheKey>(
      "pipelineSet",
      baseObjectSetWire,
      operations,
    );

    return this.store.queries.get(objectSetCacheKey, () => {
      return new ObjectSetQuery(
        this.store,
        this.store.subjects.get(objectSetCacheKey),
        baseObjectSetWire,
        operations,
        objectSetCacheKey,
        options,
      );
    });
  }

  private buildCanonicalizedOperations(
    options: ObjectSetQueryOptions,
  ): Canonical<ObjectSetOperations> {
    const operations: ObjectSetOperations = {};

    if (options.where) {
      operations.where = this.whereCanonicalizer.canonicalize(options.where);
    }

    if (options.withProperties) {
      operations.withProperties = this.rdpCanonicalizer.canonicalize(
        options.withProperties,
      );
    }

    if (options.union && options.union.length > 0) {
      operations.union = this.objectSetArrayCanonicalizer.canonicalizeUnion(
        options.union.map(os => JSON.stringify(getWirePipelineSet(os))),
      );
    }

    if (options.intersect && options.intersect.length > 0) {
      operations.intersect = this.objectSetArrayCanonicalizer
        .canonicalizeIntersect(
          options.intersect.map(os => JSON.stringify(getWirePipelineSet(os))),
        );
    }

    if (options.subtract && options.subtract.length > 0) {
      operations.subtract = this.objectSetArrayCanonicalizer
        .canonicalizeSubtract(
          options.subtract.map(os => JSON.stringify(getWirePipelineSet(os))),
        );
    }

    if (options.pivotTo) {
      operations.pivotTo = options.pivotTo as string;
    }

    if (options.orderBy) {
      operations.orderBy = this.orderByCanonicalizer.canonicalize(
        options.orderBy,
      );
    }

    if (options.select && options.select.length > 0) {
      operations.select = this.selectCanonicalizer.canonicalize(options.select);
    }

    if (options.pageSize) {
      operations.pageSize = options.pageSize;
    }

    if (options.$loadPropertySecurityMetadata) {
      operations.loadPropertySecurity = true;
    }

    return operations as Canonical<ObjectSetOperations>;
  }
}
