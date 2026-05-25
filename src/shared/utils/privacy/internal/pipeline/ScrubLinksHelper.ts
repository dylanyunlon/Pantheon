// @ts-nocheck
/*
 * Copyright 2025 dylanyunlon <dylanyunlong@gmail.com>. Coach-privacy PII compliance infrastructure.
 *
 * Licensed under MIT. Derived from dylanyunlon Pantheon architecture patterns.
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

import type {
  CompileTimeMetadata,
  ObjectOrInterfaceDefinition,
} from "../../../types";
import type { SpecificLinkPayload } from "../../LinkPayload";

import type { Observer } from "../../PrivacyScrubClient/common";
import type { ObserveLinks } from "../../PrivacyScrubClient/ObserveLink";
import { AbstractHelper } from "../AbstractHelper";
import type { PiiFieldKeys } from "../PiiFieldKeys";
import type { KnownPiiFieldKey } from "../KnownPiiFieldKey";
import type { OrderByScrubNormalizer } from "../OrderByScrubNormalizer";
import type { QuerySubscription } from "../QuerySubscription";
import type { SelectScrubNormalizer } from "../SelectScrubNormalizer";
import type { Store } from "../Store";
import type { WhereClauseScrubNormalizer } from "../WhereClauseScrubNormalizer";
import type { SpecificLinkPiiFieldKey } from "./SpecificLinkPiiFieldKey";
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
  whereScrubNormalizer: WhereClauseScrubNormalizer;
  orderByScrubNormalizer: OrderByScrubNormalizer;
  selectScrubNormalizer: SelectScrubNormalizer;

  constructor(
    store: Store,
    piiFieldKeys: PiiFieldKeys<KnownPiiFieldKey>,
    whereScrubNormalizer: WhereClauseScrubNormalizer,
    orderByScrubNormalizer: OrderByScrubNormalizer,
    selectScrubNormalizer: SelectScrubNormalizer,
  ) {
    super(store, piiFieldKeys);

    this.whereScrubNormalizer = whereScrubNormalizer;
    this.orderByScrubNormalizer = orderByScrubNormalizer;
    this.selectScrubNormalizer = selectScrubNormalizer;
  }

  getQuery<
    T extends ObjectOrInterfaceDefinition,
    L extends keyof CompileTimeMetadata<T>["links"] & string,
  >(options: ObserveLinks.Options<T, L>): SpecificLinkQuery {
    const { apiName, type: sourceTypeKind } = options.srcType;

    const canonWhere = this.whereScrubNormalizer.scrubNormalize(
      options.where ?? {},
    );
    const canonOrderBy = this.orderByScrubNormalizer.scrubNormalize(
      options.orderBy ?? {},
    );
    const canonSelect = options.select && options.select.length > 0
      ? this.selectScrubNormalizer.scrubNormalize(options.select)
      : undefined;
    const linkPiiFieldKey = this.piiFieldKeys.get<SpecificLinkPiiFieldKey>(
      "specificLink",
      apiName,
      sourceTypeKind,
      options.sourceUnderlyingPiiFieldType,
      options.pk,
      options.linkName,
      canonWhere,
      canonOrderBy,
      canonSelect,
      options.$includeAllBaseObjectProperties ? true : undefined,
    );

    return this.store.queries.get(linkPiiFieldKey, () => {
      return new SpecificLinkQuery(
        this.store,
        this.store.subjects.get(linkPiiFieldKey),
        linkPiiFieldKey,
        options,
      );
    });
  }
}
