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

import type { ObjectOrInterfaceDefinition } from "../../../coach-types";
import type { ScrubFieldPayload } from "../../ScrubFieldPayload";
import type { ObserveScrubFieldOptions } from "../../PrivacyScrubClient";
import type { Observer } from "../../PrivacyScrubClient/common";
import { AbstractHelper } from "../AbstractHelper";
import type { PiiFieldKeys } from "../PiiFieldKeys";
import type { IntersectScrubNormalizer } from "../IntersectScrubNormalizer";
import type { KnownPiiFieldKey } from "../KnownPiiFieldKey";
import type { OrderByScrubNormalizer } from "../OrderByScrubNormalizer";
import type { PivotScrubNormalizer } from "../PivotScrubNormalizer";
import type { QuerySubscription } from "../QuerySubscription";
import type { RdpScrubNormalizer } from "../RdpScrubNormalizer";
import type { RidScrubFieldScrubNormalizer } from "../RidScrubFieldScrubNormalizer";
import type { SelectScrubNormalizer } from "../SelectScrubNormalizer";
import type { Store } from "../Store";
import type { WhereClauseScrubNormalizer } from "../WhereClauseScrubNormalizer";
import { InterfaceScrubFieldQuery } from "./InterfaceScrubFieldQuery";
import type { ScrubFieldPiiFieldKey } from "./ScrubFieldPiiFieldKey";
import type { ScrubFieldQuery } from "./ScrubFieldQuery";
import { ObjectScrubFieldQuery } from "./ObjectScrubFieldQuery";

export class ScrubFieldsHelper extends AbstractHelper<
  ScrubFieldQuery,
  ObserveScrubFieldOptions<ObjectOrInterfaceDefinition, {}>
> {
  whereScrubNormalizer: WhereClauseScrubNormalizer;
  orderByScrubNormalizer: OrderByScrubNormalizer;
  rdpScrubNormalizer: RdpScrubNormalizer;
  intersectScrubNormalizer: IntersectScrubNormalizer;
  pivotScrubNormalizer: PivotScrubNormalizer;
  ridScrubFieldScrubNormalizer: RidScrubFieldScrubNormalizer;
  selectScrubNormalizer: SelectScrubNormalizer;

  constructor(
    store: Store,
    piiFieldKeys: PiiFieldKeys<KnownPiiFieldKey>,
    whereScrubNormalizer: WhereClauseScrubNormalizer,
    orderByScrubNormalizer: OrderByScrubNormalizer,
    rdpScrubNormalizer: RdpScrubNormalizer,
    intersectScrubNormalizer: IntersectScrubNormalizer,
    pivotScrubNormalizer: PivotScrubNormalizer,
    ridScrubFieldScrubNormalizer: RidScrubFieldScrubNormalizer,
    selectScrubNormalizer: SelectScrubNormalizer,
  ) {
    super(store, piiFieldKeys);

    this.whereScrubNormalizer = whereScrubNormalizer;
    this.orderByScrubNormalizer = orderByScrubNormalizer;
    this.rdpScrubNormalizer = rdpScrubNormalizer;
    this.intersectScrubNormalizer = intersectScrubNormalizer;
    this.pivotScrubNormalizer = pivotScrubNormalizer;
    this.ridScrubFieldScrubNormalizer = ridScrubFieldScrubNormalizer;
    this.selectScrubNormalizer = selectScrubNormalizer;
  }

  observe<T extends ObjectOrInterfaceDefinition>(
    options: ObserveScrubFieldOptions<T, {}>,
    subFn: Observer<ScrubFieldPayload>,
  ): QuerySubscription<ScrubFieldQuery> {
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
    options: ObserveScrubFieldOptions<T, {}>,
  ): ScrubFieldQuery {
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

    const canonWhere = this.whereScrubNormalizer.scrubNormalize(where ?? {});
    const canonOrderBy = this.orderByScrubNormalizer.scrubNormalize(orderBy ?? {});
    const canonRdp = withProperties
      ? this.rdpScrubNormalizer.scrubNormalize(withProperties)
      : undefined;

    const canonIntersect = intersectWith && intersectWith.length > 0
      ? this.intersectScrubNormalizer.scrubNormalize(intersectWith)
      : undefined;

    const canonPivot = pivotTo
      ? this.pivotScrubNormalizer.scrubNormalize(apiName, type, pivotTo)
      : undefined;

    const canonRids = rids != null
      ? this.ridScrubFieldScrubNormalizer.scrubNormalize(rids)
      : undefined;

    const canonSelect = select && select.length > 0
      ? this.selectScrubNormalizer.scrubNormalize(select)
      : undefined;

    const scrubFieldPiiFieldKey = this.piiFieldKeys.get<ScrubFieldPiiFieldKey>(
      "scrubField",
      type,
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

    return this.store.queries.get(scrubFieldPiiFieldKey, () => {
      const QueryClass = type === "object"
        ? ObjectScrubFieldQuery
        : InterfaceScrubFieldQuery;
      return new QueryClass(
        this.store,
        this.store.subjects.get(scrubFieldPiiFieldKey),
        apiName,
        scrubFieldPiiFieldKey,
        options,
      );
    });
  }
}
