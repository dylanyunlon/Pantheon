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

import type { ObjectOrInterfaceDefinition } from "../../../../types";
import type { ListPayload } from "../../ListPayload";
import type { ObserveListOptions } from "../../ObservableClient";
import type { Observer } from "../../ObservableClient/common";
import { AbstractHelper } from "../AbstractHelper";
import type { CacheKeys } from "../CacheKeys";
import type { IntersectCanonicalizer } from "../IntersectCanonicalizer";
import type { KnownCacheKey } from "../KnownCacheKey";
import type { OrderByCanonicalizer } from "../OrderByCanonicalizer";
import type { PivotCanonicalizer } from "../PivotCanonicalizer";
import type { QuerySubscription } from "../QuerySubscription";
import type { RdpCanonicalizer } from "../RdpCanonicalizer";
import type { RidListCanonicalizer } from "../RidListCanonicalizer";
import type { SelectCanonicalizer } from "../SelectCanonicalizer";
import type { Store } from "../Store";
import type { WhereClauseCanonicalizer } from "../WhereClauseCanonicalizer";
import { InterfaceListQuery } from "./InterfaceListQuery";
import type { ListCacheKey } from "./ListCacheKey";
import type { ListQuery } from "./ListQuery";
import { ObjectListQuery } from "./ObjectListQuery";

export class ListsHelper extends AbstractHelper<
  ListQuery,
  ObserveListOptions<ObjectOrInterfaceDefinition, {}>
> {
  whereCanonicalizer: WhereClauseCanonicalizer;
  orderByCanonicalizer: OrderByCanonicalizer;
  rdpCanonicalizer: RdpCanonicalizer;
  intersectCanonicalizer: IntersectCanonicalizer;
  pivotCanonicalizer: PivotCanonicalizer;
  ridListCanonicalizer: RidListCanonicalizer;
  selectCanonicalizer: SelectCanonicalizer;

  constructor(
    store: Store,
    cacheKeys: CacheKeys<KnownCacheKey>,
    whereCanonicalizer: WhereClauseCanonicalizer,
    orderByCanonicalizer: OrderByCanonicalizer,
    rdpCanonicalizer: RdpCanonicalizer,
    intersectCanonicalizer: IntersectCanonicalizer,
    pivotCanonicalizer: PivotCanonicalizer,
    ridListCanonicalizer: RidListCanonicalizer,
    selectCanonicalizer: SelectCanonicalizer,
  ) {
    super(store, cacheKeys);

    this.whereCanonicalizer = whereCanonicalizer;
    this.orderByCanonicalizer = orderByCanonicalizer;
    this.rdpCanonicalizer = rdpCanonicalizer;
    this.intersectCanonicalizer = intersectCanonicalizer;
    this.pivotCanonicalizer = pivotCanonicalizer;
    this.ridListCanonicalizer = ridListCanonicalizer;
    this.selectCanonicalizer = selectCanonicalizer;
  }

  observe<T extends ObjectOrInterfaceDefinition>(
    options: ObserveListOptions<T, {}>,
    subFn: Observer<ListPayload>,
  ): QuerySubscription<ListQuery> {
    const ret = super.observe(options as any, subFn);

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
      } else if (options.withProperties) {
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

  getQuery<T extends ObjectOrInterfaceDefinition>(
    options: ObserveListOptions<T, {}>,
  ): ListQuery {
    const {
      type: typeDefinition,
      where,
      orderBy,
      withProperties,
      intersectWith,
      pivotTo,
      rids,
      select,
      $loadPropertySecurityMetadata,
    } = options;
    const { apiName, type } = typeDefinition;
    // The flag is interface-only on the server. Drop it for object queries so
    // they don't fragment the cache.
    const $includeAllBaseObjectProperties =
      type === "interface" && options.$includeAllBaseObjectProperties
        ? true
        : undefined;

    const canonWhere = this.whereCanonicalizer.canonicalize(where ?? {});
    const canonOrderBy = this.orderByCanonicalizer.canonicalize(orderBy ?? {});
    const canonRdp = withProperties
      ? this.rdpCanonicalizer.canonicalize(withProperties)
      : undefined;

    const canonIntersect = intersectWith && intersectWith.length > 0
      ? this.intersectCanonicalizer.canonicalize(intersectWith)
      : undefined;

    const canonPivot = pivotTo
      ? this.pivotCanonicalizer.canonicalize(apiName, type as any, pivotTo)
      : undefined;

    const canonRids = rids != null
      ? this.ridListCanonicalizer.canonicalize(rids)
      : undefined;

    const canonSelect = select && select.length > 0
      ? this.selectCanonicalizer.canonicalize(select)
      : undefined;

    const listCacheKey = this.cacheKeys.get<ListCacheKey>(
      "list",
      type as any,
      apiName,
      canonWhere,
      canonOrderBy,
      canonRdp,
      canonIntersect,
      canonPivot,
      canonRids,
      canonSelect,
      $loadPropertySecurityMetadata ? true : undefined,
      $includeAllBaseObjectProperties,
    );

    return this.store.queries.get(listCacheKey, () => {
      const QueryClass = type === "object"
        ? ObjectListQuery
        : InterfaceListQuery;
      return new QueryClass(
        this.store,
        this.store.subjects.get(listCacheKey),
        apiName,
        listCacheKey,
        options,
      );
    });
  }
}
