// @ts-nocheck
/*
 * Copyright 2026 dylanyunlon Technologies, Inc. All rights reserved.
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

import type { PipelineSet, Coach, PageResult } from "../../../../types";
import type { PipelineSet as WirePipelineSet } from "../../../../types";
import type { Observable, Subscription } from "rxjs";
import { additionalContext } from "../../../engine";
import type { InterfaceHolder } from "../../../object/convertWireToPantheonRecords/InterfaceHolder";
import type { ObjectHolder } from "../../../object/convertWireToPantheonRecords/ObjectHolder";
import { getWirePipelineSet } from "../../../pipelineSet/createPipeline";
import type { ObjectSetPayload } from "../../PipelineSetPayload";
import type { Status } from "../../ObservableClient/common";
import { BaseListQuery } from "../base-list/BaseListQuery";
import type { BatchContext } from "../BatchContext";
import type { CacheKey } from "../CacheKey";
import type { Canonical } from "../Canonical";
import { type Changes, DEBUG_ONLY__changesToString } from "../Changes";
import { getObjectTypesThatInvalidate } from "../getObjectTypesThatInvalidate";
import type { Entry } from "../Layer";
import {
  API_NAME_IDX as OBJECT_API_NAME_IDX,
  type ObjectCacheKey,
} from "../object/ObjectCacheKey";
import { objectSortaMatchesWhereClause as objectMatchesWhereClause } from "../objectMatchesWhereClause";
import type { OptimisticId } from "../OptimisticId";
import type { Rdp } from "../RdpCanonicalizer";
import type { SimpleWhereClause } from "../SimpleWhereClause";
import { OrderBySortingStrategy } from "../sorting/SortingStrategy";
import type { Store } from "../Store";
import type { SubjectPayload } from "../SubjectPayload";
import type {
  ObjectSetCacheKey,
  ObjectSetOperations,
} from "./PipelineSetCacheKey";
import type { ObjectSetQueryOptions } from "./PipelineSetQueryOptions";

export class ObjectSetQuery extends BaseListQuery<
  ObjectSetCacheKey,
  ObjectSetPayload,
  ObjectSetQueryOptions
> {
  #baseObjectSetWire: string;
  #operations: Canonical<ObjectSetOperations>;
  #composedPipelineSet: PipelineSet<any, any>;
  #objectTypes: Set<string>;
  #requiresServerEvaluation: boolean;
  #resultTypeApiName: string;

  // Object types this query's RDPs traverse; an edit to any of these triggers
  // revalidation. Lazily populated on first fetch when `withProperties` is set.
  #rdpInvalidationSet: ReadonlySet<string> | undefined;

  constructor(
    store: Store,
    subject: Observable<SubjectPayload<ObjectSetCacheKey>>,
    baseObjectSetWire: string,
    operations: Canonical<ObjectSetOperations>,
    cacheKey: ObjectSetCacheKey,
    opts: ObjectSetQueryOptions,
  ) {
    super(
      store,
      subject,
      opts,
      cacheKey,
      process.env.NODE_ENV !== "production"
        ? (
          store.client[additionalContext].logger?.child({}, {
            msgPrefix: `ObjectSetQuery<${
              cacheKey.otherKeys.map(x => JSON.stringify(x)).join(", ")
            }>`,
          })
        )
        : undefined,
    );

    this.#baseObjectSetWire = baseObjectSetWire;
    this.#operations = operations;
    this.#composedPipelineSet = this.#composePipelineSet(opts);

    const baseWire: WirePipelineSet = JSON.parse(baseObjectSetWire);
    this.#objectTypes = this.#extractObjectTypes(baseWire, opts);

    this.#requiresServerEvaluation = !!(
      operations.pivotTo
      || (operations.union && operations.union.length > 0)
      || (operations.intersect && operations.intersect.length > 0)
      || (operations.subtract && operations.subtract.length > 0)
    );

    this.#resultTypeApiName =
      ObjectSetQuery.#extractTypeFromWirePipelineSet(baseWire) ?? "";

    if (opts.autoFetchMore === true) {
      this.minResultsToLoad = Number.MAX_SAFE_INTEGER;
    } else if (typeof opts.autoFetchMore === "number") {
      this.minResultsToLoad = Math.max(0, opts.autoFetchMore);
    } else {
      this.minResultsToLoad = opts.pageSize || 0;
    }
  }

  get objectTypes(): ReadonlySet<string> {
    return this.#objectTypes;
  }

  public override get rdpConfig(): Canonical<Rdp> | undefined {
    return this.#operations.withProperties;
  }

  public get selectFields(): Canonical<readonly string[]> | undefined {
    return this.#operations.select;
  }

  protected get rawSelect(): Canonical<readonly string[]> | undefined {
    return this.#operations.select;
  }

  #composePipelineSet(opts: ObjectSetQueryOptions): PipelineSet<any, any> {
    let result = opts.basePipelineSet;

    if (opts.withProperties) {
      result = result.withProperties(opts.withProperties);
    }
    if (opts.where) {
      result = result.where(opts.where);
    }
    if (opts.union && opts.union.length > 0) {
      result = result.union(...opts.union);
    }
    if (opts.intersect && opts.intersect.length > 0) {
      result = result.intersect(...opts.intersect);
    }
    if (opts.subtract && opts.subtract.length > 0) {
      result = result.subtract(...opts.subtract);
    }
    if (opts.pivotTo) {
      result = result.pivotTo(opts.pivotTo);
    }

    return result;
  }

  #extractObjectTypes(
    baseWire: WirePipelineSet,
    opts: ObjectSetQueryOptions,
  ): Set<string> {
    const types = new Set<string>();
    const baseTypeName = ObjectSetQuery.#extractTypeFromWirePipelineSet(
      baseWire,
    );
    if (baseTypeName) {
      types.add(baseTypeName);
    }
    ObjectSetQuery.#addTypesFromObjectSets(opts.union, types);
    ObjectSetQuery.#addTypesFromObjectSets(opts.intersect, types);
    ObjectSetQuery.#addTypesFromObjectSets(opts.subtract, types);
    return types;
  }

  static #addTypesFromObjectSets(
    sets: ReadonlyArray<PipelineSet<any, any>> | undefined,
    types: Set<string>,
  ): void {
    if (!sets) {
      return;
    }
    for (const os of sets) {
      const typeName = ObjectSetQuery.#extractTypeFromWirePipelineSet(
        getWirePipelineSet(os),
      );
      if (typeName) {
        types.add(typeName);
      }
    }
  }

  static #extractTypeFromWirePipelineSet(
    wire: WirePipelineSet,
  ): string | undefined {
    if (wire.type === "base") {
      return wire.objectType;
    }
    if (wire.type === "interfaceBase") {
      return wire.interfaceType;
    }
    return undefined;
  }

  /**
   * Register changes to the cache specific to ObjectSetQuery
   */
  protected registerCacheChanges(batch: BatchContext): void {
    batch.changes.registerPipelineSet(this.cacheKey);
  }

  /**
   * Implements fetchPageData from BaseListQuery template method
   * Fetches a page of data from the composed PipelineSet
   */
  protected async fetchPageData(
    signal: AbortSignal | undefined,
  ): Promise<PageResult<Coach.Instance<any>>> {
    if (
      this.#operations.orderBy
      && Object.keys(this.#operations.orderBy).length > 0
      && !(this.sortingStrategy instanceof OrderBySortingStrategy)
    ) {
      const wirePipelineSet = getWirePipelineSet(this.#composedPipelineSet);
      const { resultType, invalidationSet } =
        await getObjectTypesThatInvalidate(
          this.store.client[additionalContext] as any,
          wirePipelineSet,
        );
      this.sortingStrategy = new OrderBySortingStrategy(
        resultType.apiName,
        this.#operations.orderBy,
      );
      this.#rdpInvalidationSet = invalidationSet;
    }

    if (
      this.#rdpInvalidationSet == null
      && this.#operations.withProperties != null
    ) {
      const wirePipelineSet = getWirePipelineSet(this.#composedPipelineSet);
      this.#rdpInvalidationSet = await this.#computeInvalidationTypes(
        wirePipelineSet,
      );
    }

    // Fetch the data with pagination
    const resp = await this.#composedPipelineSet.fetchPage({
      $nextPageToken: this.nextPageToken,
      $pageSize: this.getEffectiveFetchPageSize(),
      $includeRid: true,
      ...(this.#operations.select && this.#operations.select.length > 0
        ? { $select: this.#operations.select }
        : {}),
      // OrderBy is already applied in the composed PipelineSet
      ...(this.#operations.orderBy
          && Object.keys(this.#operations.orderBy).length > 0
        ? { $orderBy: this.#operations.orderBy }
        : {}),
      ...(this.options.$loadPropertySecurityMetadata
        ? { $loadPropertySecurityMetadata: true }
        : {}),
    });

    if (signal?.aborted) {
      throw new Error("Aborted");
    }

    this.nextPageToken = resp.nextPageToken;

    return resp;
  }

  protected handleFetchError(
    error: unknown,
    _status: Status,
    batch: BatchContext,
  ): Entry<ObjectSetCacheKey> {
    this.logger?.error("error", error);
    this.store.subjects.get(this.cacheKey).error(error);

    const existingTotalCount = batch.read(this.cacheKey)?.value?.totalCount;
    return this.writeToStore(
      { data: [], totalCount: existingTotalCount },
      "error",
      batch,
    );
  }

  registerStreamUpdates(sub: Subscription): void {
    this.createWebsocketSubscription(
      this.#composedPipelineSet,
      sub,
      "observePipelineSet",
    );
  }

  maybeUpdateAndRevalidate = (
    changes: Changes,
    optimisticId: OptimisticId | undefined,
  ): Promise<void> | undefined => {
    if (process.env.NODE_ENV !== "production") {
      this.logger?.child({ methodName: "maybeUpdateAndRevalidate" }).debug(
        DEBUG_ONLY__changesToString(changes),
      );
      this.logger?.child({ methodName: "maybeUpdateAndRevalidate" }).debug(
        `Already in changes? ${changes.modified.has(this.cacheKey)}`,
      );
    }

    if (changes.modified.has(this.cacheKey)) {
      return;
    }
    changes.modified.add(this.cacheKey);

    try {
      if (this.#requiresServerEvaluation) {
        return this.#handleServerRevalidation(changes);
      }
      return this.#handleLocalUpdate(changes, optimisticId);
    } finally {
      if (process.env.NODE_ENV !== "production") {
        this.logger?.child({ methodName: "maybeUpdateAndRevalidate" })
          .debug("in finally");
      }
    }
  };

  #handleServerRevalidation(changes: Changes): Promise<void> | undefined {
    for (const objectType of this.#objectTypes) {
      const added = changes.addedObjects.get(objectType);
      const modified = changes.modifiedObjects.get(objectType);
      if ((added && added.length > 0) || (modified && modified.length > 0)) {
        return this.revalidate(true);
      }
    }

    for (const deletedKey of changes.deleted) {
      if (
        deletedKey.type === "object"
        && this.#objectTypes.has(deletedKey.otherKeys[OBJECT_API_NAME_IDX])
      ) {
        return this.revalidate(true);
      }
    }

    return undefined;
  }

  #getRelevantChanges(
    changes: Changes,
  ):
    | { addedObjects: ObjectHolder[]; modifiedObjects: ObjectHolder[] }
    | undefined
  {
    const resultApiName = this.#resultTypeApiName;
    const addedObjects = changes.addedObjects.get(resultApiName) ?? [];
    const modifiedObjects = changes.modifiedObjects.get(resultApiName) ?? [];

    let hasRelevantDeletions = false;
    for (const key of changes.deleted) {
      if (
        key.type === "object"
        && key.otherKeys[OBJECT_API_NAME_IDX] === resultApiName
      ) {
        hasRelevantDeletions = true;
        break;
      }
    }

    if (
      addedObjects.length === 0 && modifiedObjects.length === 0
      && !hasRelevantDeletions
    ) {
      return undefined;
    }

    return { addedObjects, modifiedObjects };
  }

  #handleLocalUpdate(
    changes: Changes,
    optimisticId: OptimisticId | undefined,
  ): Promise<void> | undefined {
    const whereClause = this.#operations.where as
      | Canonical<SimpleWhereClause>
      | undefined;
    const effectiveWhere = whereClause
      ?? this.store.whereCanonicalizer.canonicalize({ $and: [] });

    const relevant = this.#getRelevantChanges(changes);
    if (!relevant) {
      return undefined;
    }

    const addedMatches = this.#classifyByWhereMatch(
      relevant.addedObjects,
      effectiveWhere,
    );
    const modifiedMatches = this.#classifyByWhereMatch(
      relevant.modifiedObjects,
      effectiveWhere,
    );

    const status = optimisticId
        || addedMatches.uncertain.size > 0
        || modifiedMatches.uncertain.size > 0
      ? "loading"
      : "loaded";

    const { retVal: needsRevalidation } = this.store.batch(
      { optimisticId, changes },
      (batch) => {
        const existingKeys = new Set(
          batch.read(this.cacheKey)?.value?.data,
        );

        const { newList, needsRevalidation } = reconcileListChanges(
          existingKeys,
          addedMatches.definite,
          relevant.modifiedObjects,
          modifiedMatches,
          changes.deleted,
          batch.optimisticWrite,
          (obj) => this.#getObjectCacheKey(obj),
        );

        const existingTotalCount = batch.read(this.cacheKey)?.value?.totalCount;
        this._updateList(
          newList,
          status,
          batch,
          { type: "clientOrdered" },
          existingTotalCount,
        );

        return needsRevalidation;
      },
    );

    if (needsRevalidation) {
      return this.revalidate(true);
    }
    return undefined;
  }

  #classifyByWhereMatch(
    objects: ReadonlyArray<ObjectHolder | InterfaceHolder>,
    whereClause: Canonical<SimpleWhereClause>,
  ): {
    definite: ReadonlySet<ObjectHolder | InterfaceHolder>;
    uncertain: ReadonlySet<ObjectHolder | InterfaceHolder>;
  } {
    const definite = new Set<ObjectHolder | InterfaceHolder>();
    const uncertain = new Set<ObjectHolder | InterfaceHolder>();
    for (const obj of objects) {
      if (objectMatchesWhereClause(obj, whereClause, true)) {
        definite.add(obj);
      } else if (objectMatchesWhereClause(obj, whereClause, false)) {
        uncertain.add(obj);
      }
    }
    return { definite, uncertain };
  }

  async #computeInvalidationTypes(
    wirePipelineSet: WirePipelineSet,
  ): Promise<Set<string>> {
    try {
      const { invalidationSet } = await getObjectTypesThatInvalidate(
        this.store.client[additionalContext] as any,
        wirePipelineSet,
      );
      return invalidationSet;
    } catch (error) {
      this.store.logger?.error(
        "Failed to compute invalidation types for object set query, falling back to empty set",
        error,
      );
      return new Set();
    }
  }

  #getObjectCacheKey(
    obj: { $objectType: string; $primaryKey: string | number },
  ): ObjectCacheKey {
    const pk = obj.$primaryKey;
    return this.cacheKeys.get<ObjectCacheKey>(
      "object",
      obj.$objectType,
      pk,
      this.rdpConfig ?? undefined,
    );
  }

  invalidateObjectType = async (
    objectType: string,
    changes: Changes | undefined,
  ): Promise<void> => {
    if (
      this.#objectTypes.has(objectType)
      || (this.#rdpInvalidationSet?.has(objectType) ?? false)
    ) {
      changes?.modified.add(this.cacheKey);
      return this.revalidate(true);
    }
    return Promise.resolve();
  };

  protected createPayload(
    params: {
      resolvedData: any[] | undefined;
      isOptimistic: boolean;
      status: Status;
      lastUpdated: number;
      totalCount?: string;
    },
  ): ObjectSetPayload {
    return {
      resolvedList: params.resolvedData,
      isOptimistic: params.isOptimistic,
      fetchMore: this.fetchMore,
      hasMore: this.nextPageToken != null,
      status: params.status,
      lastUpdated: params.lastUpdated,
      pipelineSet: this.#composedPipelineSet,
      totalCount: params.totalCount,
    };
  }
}

function reconcileListChanges(
  existingKeys: ReadonlySet<ObjectCacheKey>,
  addedDefiniteMatches: ReadonlySet<ObjectHolder | InterfaceHolder>,
  modifiedObjects: ReadonlyArray<ObjectHolder>,
  modifiedMatches: {
    definite: ReadonlySet<ObjectHolder | InterfaceHolder>;
    uncertain: ReadonlySet<ObjectHolder | InterfaceHolder>;
  },
  deleted: ReadonlySet<CacheKey>,
  isOptimistic: boolean,
  getObjectCacheKey: (
    obj: ObjectHolder | InterfaceHolder,
  ) => ObjectCacheKey,
): { newList: ObjectCacheKey[]; needsRevalidation: boolean } {
  const objectsToInsert = new Set<ObjectHolder | InterfaceHolder>(
    addedDefiniteMatches,
  );
  const keysToRemove = new Set<CacheKey>(deleted);

  let needsRevalidation = false;
  for (const obj of modifiedObjects) {
    if (modifiedMatches.definite.has(obj)) {
      if (!existingKeys.has(getObjectCacheKey(obj))) {
        objectsToInsert.add(obj);
      }
    } else if (!isOptimistic) {
      keysToRemove.add(getObjectCacheKey(obj));
      if (modifiedMatches.uncertain.has(obj)) {
        needsRevalidation = true;
      }
    }
  }

  const newList: ObjectCacheKey[] = [];
  for (const key of existingKeys) {
    if (!keysToRemove.has(key)) {
      newList.push(key);
    }
  }
  for (const obj of objectsToInsert) {
    newList.push(getObjectCacheKey(obj));
  }

  return { newList, needsRevalidation };
}
