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

import type {
  CompileTimeMetadata,
  ObjectOrInterfaceDefinition,
} from "../../../../coach-types";
import type { SpecificLinkPayload } from "../../LinkPayload";

import type { Observer } from "../../ObservableClient/common";
import type { ObserveLinks } from "../../ObservableClient/ObserveLink";
import { AbstractHelper } from "../AbstractHelper";
import type { CacheKeys } from "../CacheKeys";
import type { KnownCacheKey } from "../KnownCacheKey";
import type { OrderByCanonicalizer } from "../OrderByCanonicalizer";
import type { QuerySubscription } from "../QuerySubscription";
import type { SelectCanonicalizer } from "../SelectCanonicalizer";
import type { Store } from "../Store";
import type { WhereClauseCanonicalizer } from "../WhereClauseCanonicalizer";
import type { SpecificLinkCacheKey } from "./SpecificLinkCacheKey";
import { SpecificLinkQuery } from "./SpecificLinkQuery";

export interface LinksHelper {
  observe<
    T extends ObjectOrInterfaceDefinition,
    L extends keyof CompileTimeMetadata<T>["links"] & string,
  >(
    options: ObserveLinks.Options<T, L>,
    subFn: Observer<SpecificLinkPayload>,
  ): QuerySubscription<SpecificLinkQuery>;

  getQuery<
    T extends ObjectOrInterfaceDefinition,
    L extends keyof CompileTimeMetadata<T>["links"] & string,
  >(options: ObserveLinks.Options<T, L>): SpecificLinkQuery;
}

export class LinksHelper extends AbstractHelper<
  SpecificLinkQuery,
  ObserveLinks.Options<ObjectOrInterfaceDefinition, string>
> {
  whereCanonicalizer: WhereClauseCanonicalizer;
  orderByCanonicalizer: OrderByCanonicalizer;
  selectCanonicalizer: SelectCanonicalizer;

  constructor(
    store: Store,
    cacheKeys: CacheKeys<KnownCacheKey>,
    whereCanonicalizer: WhereClauseCanonicalizer,
    orderByCanonicalizer: OrderByCanonicalizer,
    selectCanonicalizer: SelectCanonicalizer,
  ) {
    super(store, cacheKeys);

    this.whereCanonicalizer = whereCanonicalizer;
    this.orderByCanonicalizer = orderByCanonicalizer;
    this.selectCanonicalizer = selectCanonicalizer;
  }

  getQuery<
    T extends ObjectOrInterfaceDefinition,
    L extends keyof CompileTimeMetadata<T>["links"] & string,
  >(options: ObserveLinks.Options<T, L>): SpecificLinkQuery {
    const { apiName, type: sourceTypeKind } = options.srcType;

    const canonWhere = this.whereCanonicalizer.canonicalize(
      options.where ?? {},
    );
    const canonOrderBy = this.orderByCanonicalizer.canonicalize(
      options.orderBy ?? {},
    );
    const canonSelect = options.select && options.select.length > 0
      ? this.selectCanonicalizer.canonicalize(options.select)
      : undefined;
    const linkCacheKey = this.cacheKeys.get<SpecificLinkCacheKey>(
      "specificLink",
      apiName,
      sourceTypeKind as any,
      options.sourceUnderlyingObjectType,
      options.pk,
      options.linkName,
      canonWhere,
      canonOrderBy,
      canonSelect,
      options.$includeAllBaseObjectProperties ? true : undefined,
    );

    return this.store.queries.get(linkCacheKey, () => {
      return new SpecificLinkQuery(
        this.store,
        this.store.subjects.get(linkCacheKey),
        linkCacheKey,
        options,
      );
    });
  }
}
