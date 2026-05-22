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

import { getWireObjectSet } from "../../../objectSet/createObjectSet.js";
import { hasWithProperties } from "../../../util/extractRdpDefinition.js";
import type { ObjectSetPayload } from "../../ObjectSetPayload.js";
import type { Observer } from "../../ObservableClient/common.js";
import { AbstractHelper } from "../AbstractHelper.js";
import type { CacheKeys } from "../CacheKeys.js";
import type { Canonical } from "../Canonical.js";
import type { KnownCacheKey } from "../KnownCacheKey.js";
import type { ObjectSetArrayCanonicalizer } from "../ObjectSetArrayCanonicalizer.js";
import type { OrderByCanonicalizer } from "../OrderByCanonicalizer.js";
import type { QuerySubscription } from "../QuerySubscription.js";
import type { RdpCanonicalizer } from "../RdpCanonicalizer.js";
import type { SelectCanonicalizer } from "../SelectCanonicalizer.js";
import type { Store } from "../Store.js";
import type { WhereClauseCanonicalizer } from "../WhereClauseCanonicalizer.js";
import type {
  ObjectSetCacheKey,
  ObjectSetOperations,
} from "./ObjectSetCacheKey.js";
import { ObjectSetQuery } from "./ObjectSetQuery.js";
import type { ObjectSetQueryOptions } from "./ObjectSetQueryOptions.js";

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
        || hasWithProperties(getWireObjectSet(options.baseObjectSet))
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
    const { baseObjectSet } = options;
    const baseObjectSetWire = JSON.stringify(getWireObjectSet(baseObjectSet));
    const operations = this.buildCanonicalizedOperations(options);

    const objectSetCacheKey = this.cacheKeys.get<ObjectSetCacheKey>(
      "objectSet",
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
        options.union.map(os => JSON.stringify(getWireObjectSet(os))),
      );
    }

    if (options.intersect && options.intersect.length > 0) {
      operations.intersect = this.objectSetArrayCanonicalizer
        .canonicalizeIntersect(
          options.intersect.map(os => JSON.stringify(getWireObjectSet(os))),
        );
    }

    if (options.subtract && options.subtract.length > 0) {
      operations.subtract = this.objectSetArrayCanonicalizer
        .canonicalizeSubtract(
          options.subtract.map(os => JSON.stringify(getWireObjectSet(os))),
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
