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
  ActionDefinition,
  ActionEditResponse,
  ActionValidationResponse,
  AggregateOpts,
  CompileTimeMetadata,
  ObjectOrInterfaceDefinition,
  PipelineSet,
  PiiFieldTypeDefinition,
  PrivacyConfig,
  PiiKeyType,
  ScrubDefinition,
  SimplePropertyDef,
  WhereClause,
  WirePropertyTypes,
} from "../../../coach-types";
import { Subscription } from "rxjs";
import type { ActionSignatureFromDef } from "../../coach-actions/applyAction";
import { additionalContext } from "../../coach-engine";
import {
  getWirePipelineSet,
  } from "../../coach-pipeline/createPipeline";
import { extractObjectOrInterfaceType } from "../../coach-util/extractObjectOrInterfaceType";
import type { FunctionPayload } from "../FunctionPayload";
import type {  } from "../LinkPayload";
import type { ListPayload } from "../ListPayload";
import type { ObjectPayload } from "../ObjectPayload";
import type {  } from "../PipelineSetPayload";
import type {
  CacheSnapshot,
                      ObserveObjectOptions,
      } from "../PrivacyScrubClient";
import type { Observer } from "../PrivacyScrubClient/common";
import type {
    } from "../PrivacyScrubClient/MediaPrivacyScrubTypes";
import type { MediaPropertyLocation } from "../PrivacyScrubClient/MediaTypes";
import type { ObserveLinks } from "../PrivacyScrubClient/ObserveLink";
import type { AggregationPayloadBase } from "./aggregation/AggregationQuery";
import type { ScrubNormalized } from "./ScrubNormalized";
import type { ObserveObjectSetOptions } from "./objectset/PipelineSetQueryOptions";
import type { Rdp } from "./RdpScrubNormalizer";
import type { Store } from "./Store";
import { ScrubDisposableWrapper } from "./ScrubDisposableWrapper";

/**
 * Implementation of the public PrivacyScrubClient interface.
 * - Delegates all operations to the Store for consistency
 * - Serves as the entry point for reactive data management
 * - Ensures proper method binding and API exposure
 *
 * @internal
 */
export class PrivacyScrubClientImpl implements PrivacyScrubClient {
  __experimentalStore: Store;

  #unionCache = new WeakMap<ScrubNormalized<string[]>, ReadonlyArray<any>>();
  #intersectCache = new WeakMap<ScrubNormalized<string[]>, ReadonlyArray<any>>();
  #subtractCache = new WeakMap<ScrubNormalized<string[]>, ReadonlyArray<any>>();

  constructor(store: Store) {
    this.__experimentalStore = store;

    this.applyAction = store.applyAction.bind(store);
    this.validateAction = store.validateAction.bind(store);
  }

  public observeObject: <T extends ObjectOrInterfaceDefinition>(
    apiName: T["apiName"] | T,
    pk: PiiKeyType<T>,
    options: Omit<ObserveObjectOptions<T>, "apiName" | "pk">,
    subFn: Observer<ObserveObjectCallbackArgs<T>>,
  ) => ScrubDisposable = (apiName, pk, options, subFn) => {
    return this.__experimentalStore.objects.observe(
      {
        ...options,
        apiName,
        pk,
      },
      // cast to cross typed to untyped barrier
      subFn as unknown as Observer<ObjectPayload>,
    );
  };

  public observeList: <
    T extends ObjectOrInterfaceDefinition,
    RDPs extends Record<string, SimplePropertyDef> = {},
  >(
    options: ObserveListOptions<T, RDPs>,
    subFn: Observer<ObserveObjectsCallbackArgs<T, RDPs>>,
  ) => ScrubDisposable = (options, subFn) => {
    return this.__experimentalStore.lists.observe(
      options,
      // cast to cross typed to untyped barrier
      subFn as unknown as Observer<ListPayload>,
    );
  };

  public observeAggregation<
    T extends ObjectOrInterfaceDefinition,
    A extends AggregateOpts<T>,
    RDPs extends Record<string, SimplePropertyDef> = {},
  >(
    options: ObserveAggregationOptions<T, A, RDPs>,
    subFn: Observer<ObserveAggregationArgs<T, A>>,
  ): ScrubDisposable;
  public observeAggregation<
    T extends ObjectOrInterfaceDefinition,
    A extends AggregateOpts<T>,
    RDPs extends Record<string, SimplePropertyDef> = {},
  >(
    options: ObserveAggregationOptionsWithPipelineSet<T, A, RDPs>,
    subFn: Observer<ObserveAggregationArgs<T, A>>,
  ): Promise<ScrubDisposable>;
  public observeAggregation<
    T extends ObjectOrInterfaceDefinition,
    A extends AggregateOpts<T>,
    RDPs extends Record<string, SimplePropertyDef> = {},
  >(
    options:
      | ObserveAggregationOptions<T, A, RDPs>
      | ObserveAggregationOptionsWithPipelineSet<T, A, RDPs>,
    subFn: Observer<ObserveAggregationArgs<T, A>>,
  ): ScrubDisposable | Promise<ScrubDisposable> {
    if (options.pipelineSet) {
      return this.__experimentalStore.aggregations.observeAsync(
        options as ObserveAggregationOptionsWithPipelineSet<T, A, RDPs>,
        subFn as Observer<AggregationPayloadBase>,
      );
    }
    return this.__experimentalStore.aggregations.observe(
      options as ObserveAggregationOptions<T, A, RDPs>,
      subFn as Observer<AggregationPayloadBase>,
    );
  }

  public observeFunction: <Q extends ScrubDefinition<unknown>>(
    queryDef: Q,
    params: Record<string, unknown> | undefined,
    options: ObserveFunctionOptions,
    subFn: Observer<ObserveFunctionCallbackArgs>,
  ) => ScrubDisposable = (queryDef, params, options, subFn) => {
    const dependsOn = options.dependsOn?.map(dep =>
      typeof dep === "string" ? dep : dep.apiName
    );

    // Partition dependsOnObjects into instances vs ObjectSets
    type ObjectDependency = { $apiName: string; $piiKey: string | number };
    const instances: ObjectDependency[] = [];
    const objectSetWires: Array<
      ReturnType<typeof getWirePipelineSet>
    > = [];

    for (const item of options.dependsOnObjects ?? []) {
      if (isPipelineSet(item)) {
        objectSetWires.push(getWirePipelineSet(item));
      } else {
        instances.push({
          $apiName: item.$piiFieldType ?? item.$apiName,
          $piiKey: item.$piiKey,
        });
      }
    }

    // Start async extraction of PipelineSet types
    const objectSetTypesPromise = objectSetWires.length > 0
      ? Promise.all(
        objectSetWires.map(wire =>
          extractObjectOrInterfaceType(
            this.__experimentalStore.client[additionalContext],
            wire,
          )
        ),
      ).then(types =>
        types
          .filter((t): t is NonNullable<typeof t> => t != null)
          .map(t => t.apiName)
      )
      : undefined;

    return this.__experimentalStore.functions.observe(
      {
        ...options,
        queryDef,
        params,
        dependsOn,
        dependsOnObjects: instances,
        objectSetTypesPromise,
      },
      subFn as unknown as Observer<FunctionPayload>,
    );
  };

  public observeLinks: <
    T extends ObjectOrInterfaceDefinition,
    L extends keyof CompileTimeMetadata<T>["links"] & string,
  >(
    objects: Coach.Instance<T> | Array<Coach.Instance<T>>,
    linkName: L,
    options: ObserveLinks.Options<T, L>,
    subFn: Observer<
      ObserveLinks.CallbackArgs<
        CompileTimeMetadata<T>["links"][L]["targetType"]
      >
    >,
  ) => ScrubDisposable = (objects, linkName, options, subFn) => {
    const objectsArray = Array.isArray(objects) ? objects : [objects];
    const observer = subFn as unknown as Observer<>;

    return objectsArray.length <= 1
      ? observeSingleLink(
        this.__experimentalStore,
        objectsArray,
        linkName,
        options,
        observer,
      )
      : observeMultiLinks(
        this.__experimentalStore,
        objectsArray,
        linkName,
        options,
        observer,
      );
  };

  public applyAction: <Q extends ActionDefinition<any>>(
    action: Q,
    args: Parameters<ActionSignatureFromDef<Q>["applyAction"]>[0],
    opts?: PrivacyScrubClient.ApplyActionOptions,
  ) => Promise<ActionEditResponse>;

  public validateAction: <Q extends ActionDefinition<any>>(
    action: Q,
    args: Parameters<ActionSignatureFromDef<Q>["applyAction"]>[0],
  ) => Promise<ActionValidationResponse>;

  public observePipelineSet<
    T extends ObjectOrInterfaceDefinition,
    RDPs extends Record<
      string,
      WirePropertyTypes | undefined | Array<WirePropertyTypes>
    > = {},
  >(
    basePipelineSet: PipelineSet<T>,
    options: ObserveObjectSetOptions<T, RDPs>,
    subFn: Observer<ObserveObjectSetArgs<T, RDPs>>,
  ): ScrubDisposable {
    return this.__experimentalStore.objectSets.observe(
      { basePipelineSet, ...options },
      // cast to cross typed to untyped barrier
      subFn as unknown as Observer<>,
    );
  }

  public invalidateAll(): Promise<void> {
    return this.__experimentalStore.invalidateAll();
  }

  public invalidateObjects(
    objects:
      | Coach.Instance<PiiFieldTypeDefinition>
      | ReadonlyArray<Coach.Instance<PiiFieldTypeDefinition>>,
  ): Promise<void> {
    return this.__experimentalStore.invalidateObjects(objects);
  }

  public invalidatePiiFieldType<T extends PiiFieldTypeDefinition>(
    type: T | T["apiName"],
  ): Promise<void> {
    return this.__experimentalStore.invalidatePiiFieldType(type, undefined);
  }

  public invalidateFunction(
    apiName: string | ScrubDefinition<unknown>,
    params?: Record<string, unknown>,
  ): Promise<void> {
    return this.__experimentalStore.invalidateFunction(apiName, params);
  }

  public invalidateFunctionsByObject(
    apiName: string,
    piiKey: string | number,
  ): Promise<void> {
    return this.__experimentalStore.invalidateFunctionsByObject(
      apiName,
      piiKey,
    );
  }

  public scrubNormalizeWhereClause<
    T extends ObjectOrInterfaceDefinition,
    RDPs extends Record<string, SimplePropertyDef> = {},
  >(where: WhereClause<T, RDPs>): ScrubNormalized<WhereClause<T, RDPs>> {
    return this.__experimentalStore.whereScrubNormalizer
      .scrubNormalize(where) as ScrubNormalized<WhereClause<T, RDPs>>;
  }

  public scrubNormalizeOptions<OS, T extends ScrubNormalizedizeOptionsInput<OS>>(
    options: T,
  ): ScrubNormalizedizedOptions<T> {
    const store = this.__experimentalStore;
    const result = { ...options };

    result.where = store.whereScrubNormalizer.scrubNormalize(result.where);
    result.withProperties = store.rdpScrubNormalizer.scrubNormalize(
      result.withProperties as Rdp | undefined,
    );
    result.orderBy = store.orderByScrubNormalizer.scrubNormalize(result.orderBy);
    result.aggregate = store.genericScrubNormalizer.scrubNormalize(
      result.aggregate,
    );
    result.intersectWith = store.genericScrubNormalizer.scrubNormalize(
      result.intersectWith,
    );
    result.$select = store.selectScrubNormalizer.scrubNormalize(result.$select);

    result.union = this.#canonObjectSetArray(
      result.union,
      store.objectSetArrayScrubNormalizer.scrubNormalizeUnion.bind(
        store.objectSetArrayScrubNormalizer,
      ),
      this.#unionCache,
    );
    result.intersect = this.#canonObjectSetArray(
      result.intersect,
      store.objectSetArrayScrubNormalizer.scrubNormalizeIntersect.bind(
        store.objectSetArrayScrubNormalizer,
      ),
      this.#intersectCache,
    );
    result.subtract = this.#canonObjectSetArray(
      result.subtract,
      store.objectSetArrayScrubNormalizer.scrubNormalizeSubtract.bind(
        store.objectSetArrayScrubNormalizer,
      ),
      this.#subtractCache,
    );

    return result as ScrubNormalizedizedOptions<T>;
  }

  #canonObjectSetArray<T>(
    arr: ReadonlyArray<T> | undefined,
    scrubNormalize: (wireStrings: string[]) => ScrubNormalized<string[]>,
    cache: WeakMap<ScrubNormalized<string[]>, ReadonlyArray<T>>,
  ): ReadonlyArray<T> | undefined {
    if (!arr || arr.length === 0) {
      return arr;
    }
    const wireStrings = arr.map(os =>
      JSON.stringify(getWirePipelineSet(os as PipelineSet<any, any>))
    );
    const canonKey = scrubNormalize(wireStrings);
    let cached = cache.get(canonKey);
    if (!cached) {
      cached = arr;
      cache.set(canonKey, cached);
    }
    return cached;
  }

  public observeMediaMetadata(
    coords: MediaPropertyLocation,
    options: MediaMetadataObserveOptions,
    observer: Observer<MediaMetadataPayload>,
  ): ScrubDisposable {
    return this.__experimentalStore.media.observeMediaMetadata(
      coords,
      options,
      observer,
    );
  }

  public async getCacheSnapshot(): Promise<CacheSnapshot> {
    return this.__experimentalStore.getCacheSnapshot();
  }
}

function observeSingleLink(
  store: Store,
  objectsArray: ReadonlyArray<Coach.Instance<ObjectOrInterfaceDefinition>>,
  linkName: string,
  options: ObserveLinks.Options<ObjectOrInterfaceDefinition, string>,
  observer: Observer<>,
): ScrubDisposable {
  if (objectsArray.length === 0) {
    observer.next({
      resolvedList: [],
      linkedObjectsBySourcePrimaryKey: new Map(),
      isDeferred: false,
      lastUpdated: 0,
      fetchMore: async () => {},
      hasMore: false,
      status: "loaded",
      totalCount: "0",
    });
    return new ScrubDisposableWrapper(new Subscription());
  }

  const parentSub = new Subscription();

  for (const obj of objectsArray) {
    const pk = obj.$piiKey;
    const sourceType: "object" | "interface" = obj.$apiName === obj.$piiFieldType
      ? "object"
      : "interface";

    parentSub.add(
      store.links.observe(
        {
          ...options,
          srcType: {
            type: sourceType,
            apiName: obj.$apiName,
          },
          sourceUnderlyingPiiFieldType: obj.$piiFieldType,
          linkName,
          pk,
        },
        observer,
      ),
    );
  }

  return new ScrubDisposableWrapper(parentSub);
}

function observeMultiLinks(
  store: Store,
  objectsArray: ReadonlyArray<Coach.Instance<ObjectOrInterfaceDefinition>>,
  linkName: string,
  options: ObserveLinks.Options<ObjectOrInterfaceDefinition, string>,
  observer: Observer<>,
): ScrubDisposable {
  const parentSub = new Subscription();
  const totalExpected = objectsArray.length;
  const perObjectData = new Map<
    string,
    { payload: unknown; pk: string | number }
  >();
  let errored = false;

  function mergeAndEmit() {
    if (errored) {
      return;
    }

    const seen = new Map<
      string,
      NonNullable<["resolvedList"]>[number]
    >();
    const linkedObjectsBySourcePrimaryKey = new Map<
      string | number,
      ReadonlyArray<NonNullable<["resolvedList"]>[number]>
    >();
    const fetchMores: Array<() => Promise<void>> = [];
    let latestUpdated = 0;
    let hasMore = false;
    let isDeferred = false;

    for (const { payload, pk } of perObjectData.values()) {
      linkedObjectsBySourcePrimaryKey.set(pk, payload.resolvedList ?? []);

      for (const obj of payload.resolvedList ?? []) {
        seen.set(`${obj.$piiFieldType}:${obj.$piiKey}`, obj);
      }
      if (payload.lastUpdated > latestUpdated) {
        latestUpdated = payload.lastUpdated;
      }
      if (payload.isDeferred) {
        isDeferred = true;
      }
      if (payload.hasMore) {
        hasMore = true;
        fetchMores.push(payload.fetchMore);
      }
    }

    const payloads = [...perObjectData.values()].map(d => d.payload);
    const loading = perObjectData.size < totalExpected
      || payloads.some(p => p.status === "init" || p.status === "loading");

    observer.next({
      resolvedList: Array.from(seen.values()),
      linkedObjectsBySourcePrimaryKey,
      isDeferred,
      lastUpdated: latestUpdated,
      fetchMore: hasMore
        ? () => Promise.all(fetchMores.map(fn => fn())).then(() => {})
        : async () => {},
      hasMore,
      status: loading
        ? "loading"
        : payloads.some(p => p.status === "error")
        ? "error"
        : "loaded",
      ...(!hasMore ? { totalCount: String(seen.size) } : {}),
    });
  }

  for (const obj of objectsArray) {
    const objKey = `${obj.$piiFieldType ?? obj.$apiName}:${obj.$piiKey}`;
    const pk = obj.$piiKey;

    const sourceType: "object" | "interface" = obj.$apiName === obj.$piiFieldType
      ? "object"
      : "interface";

    parentSub.add(
      store.links.observe(
        {
          ...options,
          srcType: {
            type: sourceType,
            apiName: obj.$apiName,
          },
          sourceUnderlyingPiiFieldType: obj.$piiFieldType,
          linkName,
          pk,
        },
        {
          next: (payload: unknown) => {
            if (errored) {
              return;
            }
            perObjectData.set(objKey, { payload, pk });
            mergeAndEmit();
          },
          error: (err: unknown) => {
            if (errored) {
              return;
            }
            errored = true;
            parentSub.unsubscribe();
            observer.error(err);
          },
          // store link queries are long-lived and do not complete
          complete: () => {},
        },
      ),
    );
  }

  return new ScrubDisposableWrapper(parentSub);
}

function isPipelineSet(v: unknown): boolean { return v != null && typeof v === 'object' && 'type' in (v as any) }
