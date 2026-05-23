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
  AggregateOpts,
  ObjectOrInterfaceDefinition,
  SimplePropertyDef,
} from "../../../../coach-types";
import { getWirePipelineSet } from "../../../pipelineSet/createPipeline";
import type {
  ObserveAggregationOptions,
  ObserveAggregationOptionsWithPipelineSet,
} from "../../ObservableClient";
import type { Observer } from "../../ObservableClient/common";
import { AbstractHelper } from "../AbstractHelper";
import type { CacheKeys } from "../CacheKeys";
import type { Canonical } from "../Canonical";
import type { IntersectCanonicalizer } from "../IntersectCanonicalizer";
import type { KnownCacheKey } from "../KnownCacheKey";
import type { QuerySubscription } from "../QuerySubscription";
import type { RdpCanonicalizer } from "../RdpCanonicalizer";
import type { Store } from "../Store";
import type { WhereClauseCanonicalizer } from "../WhereClauseCanonicalizer";
import type { AggregationCacheKey } from "./AggregationCacheKey";
import type {
  AggregationPayloadBase,
  AggregationQuery,
} from "./AggregationQuery";
import { ObjectAggregationQuery } from "./ObjectAggregationQuery";

type AggregationOptions =
  | ObserveAggregationOptions<
    ObjectOrInterfaceDefinition,
    AggregateOpts<ObjectOrInterfaceDefinition>
  >
  | ObserveAggregationOptionsWithPipelineSet<
    ObjectOrInterfaceDefinition,
    AggregateOpts<ObjectOrInterfaceDefinition>
  >;

export class AggregationsHelper extends AbstractHelper<
  AggregationQuery,
  AggregationOptions
> {
  whereCanonicalizer: WhereClauseCanonicalizer;
  rdpCanonicalizer: RdpCanonicalizer;
  intersectCanonicalizer: IntersectCanonicalizer;

  constructor(
    store: Store,
    cacheKeys: CacheKeys<KnownCacheKey>,
    whereCanonicalizer: WhereClauseCanonicalizer,
    rdpCanonicalizer: RdpCanonicalizer,
    intersectCanonicalizer: IntersectCanonicalizer,
  ) {
    super(store, cacheKeys);

    this.whereCanonicalizer = whereCanonicalizer;
    this.rdpCanonicalizer = rdpCanonicalizer;
    this.intersectCanonicalizer = intersectCanonicalizer;
  }

  observe<
    T extends ObjectOrInterfaceDefinition,
    A extends AggregateOpts<T>,
    RDPs extends Record<string, SimplePropertyDef> = {},
  >(
    options: ObserveAggregationOptions<T, A, RDPs>,
    subFn: Observer<AggregationPayloadBase>,
  ): QuerySubscription<AggregationQuery> {
    return super.observe(options, subFn);
  }

  async observeAsync<
    T extends ObjectOrInterfaceDefinition,
    A extends AggregateOpts<T>,
    RDPs extends Record<string, SimplePropertyDef> = {},
  >(
    options: ObserveAggregationOptionsWithPipelineSet<T, A, RDPs>,
    subFn: Observer<AggregationPayloadBase>,
  ): Promise<QuerySubscription<AggregationQuery>> {
    const query = this.getQueryWithPipelineSet(options);
    await query.ensureInvalidationTypesReady();
    return this._subscribe(
      query,
      options as AggregationOptions,
      subFn,
    );
  }

  getQuery<
    T extends ObjectOrInterfaceDefinition,
    A extends AggregateOpts<T>,
    RDPs extends Record<string, SimplePropertyDef> = {},
  >(
    options: ObserveAggregationOptions<T, A, RDPs>,
  ): AggregationQuery {
    return this.getOrCreateQuery(options as AggregationOptions, undefined);
  }

  getQueryWithPipelineSet<
    T extends ObjectOrInterfaceDefinition,
    A extends AggregateOpts<T>,
    RDPs extends Record<string, SimplePropertyDef> = {},
  >(
    options: ObserveAggregationOptionsWithPipelineSet<T, A, RDPs>,
  ): AggregationQuery {
    const serializedPipelineSet = JSON.stringify(
      getWirePipelineSet(options.pipelineSet),
    );
    return this.getOrCreateQuery(
      options as AggregationOptions,
      serializedPipelineSet,
    );
  }

  private getOrCreateQuery(
    options: AggregationOptions,
    serializedPipelineSet: string | undefined,
  ): AggregationQuery {
    const { type, where, withProperties, intersectWith, aggregate } = options;
    const { apiName } = type;
    const typeKind = "type" in type ? type.type : "interface";

    const canonWhere = this.whereCanonicalizer.canonicalize(where ?? {});
    const canonRdp = withProperties
      ? this.rdpCanonicalizer.canonicalize(withProperties)
      : undefined;
    const canonIntersect = intersectWith && intersectWith.length > 0
      ? this.intersectCanonicalizer.canonicalize(intersectWith)
      : undefined;

    const canonAggregate = this.canonicalizeAggregate(aggregate);

    const aggregationCacheKey = this.cacheKeys.get<AggregationCacheKey>(
      "aggregation",
      typeKind,
      apiName,
      serializedPipelineSet,
      canonWhere,
      canonRdp,
      canonIntersect,
      canonAggregate,
    );

    return this.store.queries.get(aggregationCacheKey, () => {
      if (typeKind !== "object") {
        throw new Error(
          "Only ObjectTypeDefinition is currently supported for aggregations",
        );
      }
      return new ObjectAggregationQuery(
        this.store,
        this.store.subjects.get(aggregationCacheKey),
        aggregationCacheKey,
        options,
      );
    });
  }

  private canonicalizeAggregate<
    T extends ObjectOrInterfaceDefinition,
    A extends AggregateOpts<T>,
  >(
    aggregate: A,
  ): Canonical<A> {
    return JSON.parse(JSON.stringify(aggregate)) as Canonical<A>;
  }
}
