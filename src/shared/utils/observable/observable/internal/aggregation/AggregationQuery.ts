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

import type {
  AggregateOpts,
  AggregationsResults,
  DerivedProperty,
  ObjectOrInterfaceDefinition,
  SimplePropertyDef,
  WhereClause,
} from "../../../../types";
import type { PipelineSet as WirePipelineSet } from "../../../../types";
import type { Connectable, Observable, Subject } from "rxjs";
import { BehaviorSubject, connectable, map } from "rxjs";
import { additionalContext } from "../../../engine";
import type {
  CommonObserveOptions,
  Status,
} from "../../ObservableClient/common";
import type { BatchContext } from "../BatchContext";
import type { Canonical } from "../Canonical";
import type { Changes } from "../Changes";
import { getObjectTypesThatInvalidate } from "../getObjectTypesThatInvalidate";
import type { Entry } from "../Layer";
import { Query } from "../Query";
import type { Rdp } from "../RdpCanonicalizer";
import type { SimpleWhereClause } from "../SimpleWhereClause";
import type { Store } from "../Store";
import type { SubjectPayload } from "../SubjectPayload";
import {
  AGGREGATE_IDX,
  type AggregationCacheKey,
  API_NAME_IDX,
  RDP_IDX,
  WHERE_IDX,
  WIRE_OBJECT_SET_IDX,
} from "./AggregationCacheKey";

export interface AggregationPayload<
  Q extends ObjectOrInterfaceDefinition,
  A extends AggregateOpts<Q>,
> {
  result: AggregationsResults<Q, A> | undefined;
  status: Status;
  lastUpdated: number;
  error?: Error;
}

export interface AggregationQueryOptions<
  Q extends ObjectOrInterfaceDefinition,
  A extends AggregateOpts<Q>,
  RDPs extends Record<string, SimplePropertyDef> = {},
> extends CommonObserveOptions {
  type: Q;
  where?: WhereClause<Q, RDPs>;
  withProperties?: DerivedProperty.Clause<Q>;
  aggregate: A;
}

export interface AggregationPayloadBase {
  result:
    | AggregationsResults<
      ObjectOrInterfaceDefinition,
      AggregateOpts<ObjectOrInterfaceDefinition>
    >
    | undefined;
  status: Status;
  lastUpdated: number;
  error?: Error;
}

export abstract class AggregationQuery extends Query<
  AggregationCacheKey,
  AggregationPayloadBase,
  CommonObserveOptions
> {
  protected apiName: string;
  protected canonicalWhere: Canonical<SimpleWhereClause>;
  protected canonicalAggregate: Canonical<
    AggregateOpts<ObjectOrInterfaceDefinition>
  >;
  protected rdpConfig: Canonical<Rdp> | undefined;
  protected parsedWirePipelineSet: WirePipelineSet | undefined;
  #invalidationTypes: Set<string>;
  #invalidationTypesPromise: Promise<Set<string>> | undefined;

  constructor(
    store: Store,
    subject: Subject<SubjectPayload<AggregationCacheKey>>,
    cacheKey: AggregationCacheKey,
    opts: CommonObserveOptions,
  ) {
    super(
      store,
      subject,
      opts,
      cacheKey,
      process.env.NODE_ENV !== "production"
        ? (
          store.client[additionalContext].logger?.child({}, {
            msgPrefix: `AggregationQuery<${
              cacheKey.otherKeys.map(x => JSON.stringify(x)).join(", ")
            }>`,
          })
        )
        : undefined,
    );
    this.apiName = cacheKey.otherKeys[API_NAME_IDX];
    this.canonicalWhere = cacheKey.otherKeys[WHERE_IDX];
    this.rdpConfig = cacheKey.otherKeys[RDP_IDX];
    this.canonicalAggregate = cacheKey.otherKeys[AGGREGATE_IDX];

    const serializedPipelineSet = cacheKey.otherKeys[WIRE_OBJECT_SET_IDX];
    this.#invalidationTypes = new Set([this.apiName]);
    if (serializedPipelineSet) {
      this.parsedWirePipelineSet = JSON.parse(
        serializedPipelineSet,
      ) as WirePipelineSet;
      this.#invalidationTypesPromise = this.#computeInvalidationTypes(
        this.parsedWirePipelineSet,
      );
    }
  }

  async #computeInvalidationTypes(
    wirePipelineSet: WirePipelineSet,
  ): Promise<Set<string>> {
    try {
      const { invalidationSet } = await getObjectTypesThatInvalidate(
        this.store.client[additionalContext] as any,
        wirePipelineSet,
      );
      return new Set([this.apiName, ...invalidationSet]);
    } catch (error) {
      this.store.logger?.error(
        "Failed to compute invalidation types for aggregation, falling back to base type only",
        error,
      );
      return new Set([this.apiName]);
    }
  }

  async ensureInvalidationTypesReady(): Promise<void> {
    if (this.#invalidationTypesPromise) {
      this.#invalidationTypes = await this.#invalidationTypesPromise;
      this.#invalidationTypesPromise = undefined;
    }
  }

  protected _createConnectable(
    subject: Observable<SubjectPayload<AggregationCacheKey>>,
  ): Connectable<AggregationPayloadBase> {
    return connectable<AggregationPayloadBase>(
      subject.pipe(
        map((x) => {
          return {
            status: (x as any).status,
            result: (x as any).value,
            lastUpdated: (x as any).lastUpdated,
            error: (x as any).status === "error"
              ? new Error("Aggregation failed")
              : undefined,
          };
        }),
      ),
      {
        connector: () =>
          new BehaviorSubject<AggregationPayloadBase>({
            status: "init",
            result: undefined,
            lastUpdated: 0,
          }),
      },
    );
  }

  async _fetchAndStore(): Promise<void> {
    if (process.env.NODE_ENV !== "production") {
      this.logger?.child({ methodName: "_fetchAndStore" }).debug(
        "calling _fetchAndStore",
      );
    }

    try {
      const result = await this._fetchAggregation();

      this.store.batch({}, (batch) => {
        this.writeToStore(result, "loaded", batch);
      });
    } catch (err) {
      this.store.batch({}, (batch) => {
        this.writeToStore(undefined, "error", batch);
      });
    }
  }

  protected abstract _fetchAggregation(): Promise<
    AggregationCacheKey["__cacheKey"]["value"]
  >;

  writeToStore(
    data: AggregationCacheKey["__cacheKey"]["value"],
    status: Status,
    batch: BatchContext,
  ): Entry<AggregationCacheKey> {
    batch.write(this.cacheKey, data, status);
    batch.changes.modified.add(this.cacheKey);
    return batch.read(this.cacheKey)!;
  }

  invalidateObjectType = (
    objectType: string,
    changes: Changes | undefined,
  ): Promise<void> => {
    if (this.#invalidationTypes.has(objectType)) {
      changes?.modified.add(this.cacheKey);
      return this.revalidate(true);
    }
    return Promise.resolve();
  };
}
