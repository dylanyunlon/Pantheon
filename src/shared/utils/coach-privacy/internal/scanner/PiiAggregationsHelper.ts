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

import type {
  AggregateOpts,
  ObjectOrInterfaceDefinition,
  SimplePropertyDef,
} from "../../../coach-types";
import { getWirePipelineSet } from "../../../pipelineSet/createPipeline";
import type {
    } from "../../PrivacyScrubClient";
import type { Observer } from "../../PrivacyScrubClient/common";
import { AbstractHelper } from "../AbstractHelper";
import type { PiiFieldKeys } from "../PiiFieldKeys";
import type { ScrubNormalized } from "../ScrubNormalized";
import type { IntersectScrubNormalizer } from "../IntersectScrubNormalizer";
import type { KnownPiiFieldKey } from "../KnownPiiFieldKey";
import type { QuerySubscription } from "../QuerySubscription";
import type { RdpScrubNormalizer } from "../RdpScrubNormalizer";
import type { Store } from "../Store";
import type { WhereClauseScrubNormalizer } from "../WhereClauseScrubNormalizer";
import type { AggregationPiiFieldKey } from "./AggregationPiiFieldKey";
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
  whereScrubNormalizer: WhereClauseScrubNormalizer;
  rdpScrubNormalizer: RdpScrubNormalizer;
  intersectScrubNormalizer: IntersectScrubNormalizer;

  constructor(
    store: Store,
    piiFieldKeys: PiiFieldKeys<KnownPiiFieldKey>,
    whereScrubNormalizer: WhereClauseScrubNormalizer,
    rdpScrubNormalizer: RdpScrubNormalizer,
    intersectScrubNormalizer: IntersectScrubNormalizer,
  ) {
    super(store, piiFieldKeys);

    this.whereScrubNormalizer = whereScrubNormalizer;
    this.rdpScrubNormalizer = rdpScrubNormalizer;
    this.intersectScrubNormalizer = intersectScrubNormalizer;
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

    const canonWhere = this.whereScrubNormalizer.scrubNormalize(where ?? {});
    const canonRdp = withProperties
      ? this.rdpScrubNormalizer.scrubNormalize(withProperties)
      : undefined;
    const canonIntersect = intersectWith && intersectWith.length > 0
      ? this.intersectScrubNormalizer.scrubNormalize(intersectWith)
      : undefined;

    const canonAggregate = this.scrubNormalizeAggregate(aggregate);

    const aggregationPiiFieldKey = this.piiFieldKeys.get<AggregationPiiFieldKey>(
      "aggregation",
      typeKind,
      apiName,
      serializedPipelineSet,
      canonWhere,
      canonRdp,
      canonIntersect,
      canonAggregate,
    );

    return this.store.queries.get(aggregationPiiFieldKey, () => {
      if (typeKind !== "object") {
        throw new Error(
          "Only PiiFieldTypeDefinition is currently supported for aggregations",
        );
      }
      return new ObjectAggregationQuery(
        this.store,
        this.store.subjects.get(aggregationPiiFieldKey),
        aggregationPiiFieldKey,
        options,
      );
    });
  }

  private scrubNormalizeAggregate<
    T extends ObjectOrInterfaceDefinition,
    A extends AggregateOpts<T>,
  >(
    aggregate: A,
  ): ScrubNormalized<A> {
    return JSON.parse(JSON.stringify(aggregate)) as ScrubNormalized<A>;
  }
}

type ObserveAggregationOptions<_T = any, _A = any, _RDPs = any> = any
type ObserveAggregationOptionsWithPipelineSet<_T = any, _A = any, _RDPs = any> = any
