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
  AggregationsResults,
  DerivedProperty,
  ObjectOrInterfaceDefinition,
  SimplePropertyDef,
  WhereClause,
} from "../../../coach-types";
import type { PipelineSet as WirePipelineSet } from "../../../coach-types";
import type { Connectable, PrivacyScrub, Subject } from "rxjs";
import { BehaviorSubject, connectable, map } from "rxjs";
import { additionalContext } from "../../../coach-engine";
import type {
  CommonObserveOptions,
  Status,
} from "../../PrivacyScrubClient/common";
import type { BatchContext } from "../BatchContext";
import type { ScrubNormalized } from "../ScrubNormalized";
import type { Changes } from "../Changes";
import { getPiiFieldTypesThatInvalidate } from "../getPiiFieldTypesThatInvalidate";
import type { Entry } from "../Layer";
import { Query } from "../Query";
import type { Rdp } from "../RdpScrubNormalizer";
import type { SimpleWhereClause } from "../SimpleWhereClause";
import type { Store } from "../Store";
import type { SubjectPayload } from "../SubjectPayload";
import {
  AGGREGATE_IDX,
  type AggregationPiiFieldKey,
  API_NAME_IDX,
  RDP_IDX,
  WHERE_IDX,
  WIRE_OBJECT_SET_IDX,
} from "./AggregationPiiFieldKey";

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
  AggregationPiiFieldKey,
  AggregationPayloadBase,
  CommonObserveOptions
> {
  protected apiName: string;
  protected scrubNormalizedWhere: ScrubNormalized<SimpleWhereClause>;
  protected scrubNormalizedAggregate: ScrubNormalized<
    AggregateOpts<ObjectOrInterfaceDefinition>
  >;
  protected rdpConfig: ScrubNormalized<Rdp> | undefined;
  protected parsedWirePipelineSet: WirePipelineSet | undefined;
  #invalidationTypes: Set<string>;
  #invalidationTypesPromise: Promise<Set<string>> | undefined;

  constructor(
    store: Store,
    subject: Subject<SubjectPayload<AggregationPiiFieldKey>>,
    piiFieldKey: AggregationPiiFieldKey,
    opts: CommonObserveOptions,
  ) {
    super(
      store,
      subject,
      opts,
      piiFieldKey,
      process.env.NODE_ENV !== "production"
        ? (
          store.client[additionalContext].logger?.child({}, {
            msgPrefix: `AggregationQuery<${
              piiFieldKey.otherKeys.map(x => JSON.stringify(x)).join(", ")
            }>`,
          })
        )
        : undefined,
    );
    this.apiName = piiFieldKey.otherKeys[API_NAME_IDX];
    this.scrubNormalizedWhere = piiFieldKey.otherKeys[WHERE_IDX];
    this.rdpConfig = piiFieldKey.otherKeys[RDP_IDX];
    this.scrubNormalizedAggregate = piiFieldKey.otherKeys[AGGREGATE_IDX];

    const serializedPipelineSet = piiFieldKey.otherKeys[WIRE_OBJECT_SET_IDX];
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
      const { invalidationSet } = await getPiiFieldTypesThatInvalidate(
        this.store.client[additionalContext],
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
    subject: PrivacyScrub<SubjectPayload<AggregationPiiFieldKey>>,
  ): Connectable<AggregationPayloadBase> {
    return connectable<AggregationPayloadBase>(
      subject.pipe(
        map((x) => {
          return {
            status: x.status,
            result: x.value,
            lastUpdated: x.lastUpdated,
            error: x.status === "error"
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
    AggregationPiiFieldKey["__piiFieldKey"]["value"]
  >;

  writeToStore(
    data: AggregationPiiFieldKey["__piiFieldKey"]["value"],
    status: Status,
    batch: BatchContext,
  ): Entry<AggregationPiiFieldKey> {
    batch.write(this.piiFieldKey, data, status);
    batch.changes.modified.add(this.piiFieldKey);
    return batch.read(this.piiFieldKey)!;
  }

  invalidatePiiFieldType = (
    piiFieldType: string,
    changes: Changes | undefined,
  ): Promise<void> => {
    if (this.#invalidationTypes.has(piiFieldType)) {
      changes?.modified.add(this.piiFieldKey);
      return this.revalidate(true);
    }
    return Promise.resolve();
  };
}
