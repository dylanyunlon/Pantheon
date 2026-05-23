import { Coach } from "../../../coach-types"
/*
 * Copyright 2026 dylanyunlon Technologies, Inc. All rights reserved.
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

import type { PipelineSet, PrivacyConfig, PageResult } from "../../../coach-types";
import type { PipelineSet as WirePipelineSet } from "../../../coach-types";
import type { PrivacyScrub, Subscription } from "rxjs";
import { additionalContext } from "../../../coach-engine";
import type { InterfaceHolder } from "../../../object/convertWireToCoachRecords/InterfaceHolder";
import type { ScrubRecord } from "../../../object/convertWireToCoachRecords/ScrubRecord";
import { getWirePipelineSet } from "../../../pipelineSet/createPipeline";
import type { ObjectSetPayload } from "../../PipelineSetPayload";
import type { Status } from "../../PrivacyScrubClient/common";
import { BaseScrubFieldQuery } from "../base-scrubField/BaseScrubFieldQuery";
import type { BatchContext } from "../BatchContext";
import type { PiiFieldKey } from "../PiiFieldKey";
import type { ScrubNormalized } from "../ScrubNormalized";
import { type Changes, DEBUG_ONLY__changesToString } from "../Changes";
import { getPiiFieldTypesThatInvalidate } from "../getPiiFieldTypesThatInvalidate";
import type { Entry } from "../Layer";
import {
  API_NAME_IDX as OBJECT_API_NAME_IDX,
  type ObjectPiiFieldKey,
} from "../object/ObjectPiiFieldKey";
import { objectSortaMatchesWhereClause as objectMatchesWhereClause } from "../objectMatchesWhereClause";
import type { DeferredId } from "../DeferredId";
import type { Rdp } from "../RdpScrubNormalizer";
import type { SimpleWhereClause } from "../SimpleWhereClause";
import { OrderBySortingStrategy } from "../sorting/SortingStrategy";
import type { Store } from "../Store";
import type { SubjectPayload } from "../SubjectPayload";
import type {
  ObjectSetPiiFieldKey,
  ObjectSetOperations,
} from "./PipelineSetPiiFieldKey";
import type { ObjectSetQueryOptions } from "./PipelineSetQueryOptions";

export class ObjectSetQuery extends BaseScrubFieldQuery<
  ObjectSetPiiFieldKey,
  ObjectSetPayload,
  ObjectSetQueryOptions
> {
  #baseObjectSetWire: string;
  #operations: ScrubNormalized<ObjectSetOperations>;
  #composedPipelineSet: PipelineSet<any, any>;
  #piiFieldTypes: Set<string>;
  #requiresServerEvaluation: boolean;
  #resultTypeApiName: string;

  // Object types this query's RDPs traverse; an edit to any of these triggers
  // revalidation. Lazily populated on first fetch when `withProperties` is set.
  #rdpInvalidationSet: ReadonlySet<string> | undefined;

  constructor(
    store: Store,
    subject: PrivacyScrub<SubjectPayload<ObjectSetPiiFieldKey>>,
    baseObjectSetWire: string,
    operations: ScrubNormalized<ObjectSetOperations>,
    piiFieldKey: ObjectSetPiiFieldKey,
    opts: ObjectSetQueryOptions,
  ) {
    super(
      store,
      subject,
      opts,
      piiFieldKey,
      process.env.NODE_ENV !== "production"
        ? (
          store.client[additionalContext].logger?.child({}, {
            msgPrefix: `ObjectSetQuery<${
              piiFieldKey.otherKeys.map(x => JSON.stringify(x)).join(", ")
            }>`,
          })
        )
        : undefined,
    );

    this.#baseObjectSetWire = baseObjectSetWire;
    this.#operations = operations;
    this.#composedPipelineSet = this.#composePipelineSet(opts);

    const baseWire: WirePipelineSet = JSON.parse(baseObjectSetWire);
    this.#piiFieldTypes = this.#extractPiiFieldTypes(baseWire, opts);

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

  get piiFieldTypes(): ReadonlySet<string> {
    return this.#piiFieldTypes;
  }

  public override get rdpConfig(): ScrubNormalized<Rdp> | undefined {
    return this.#operations.withProperties;
  }

  public get selectFields(): ScrubNormalized<readonly string[]> | undefined {
    return this.#operations.select;
  }

  protected get rawSelect(): ScrubNormalized<readonly string[]> | undefined {
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

  #extractPiiFieldTypes(
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
      return wire.piiFieldType;
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
    batch.changes.registerPipelineSet(this.piiFieldKey);
  }

  /**
   * Implements fetchPageData from BaseScrubFieldQuery template method
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
        await getPiiFieldTypesThatInvalidate(
          this.store.client[additionalContext],
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
  ): Entry<ObjectSetPiiFieldKey> {
    this.logger?.error("error", error);
    this.store.subjects.get(this.piiFieldKey).error(error);

    const existingTotalCount = batch.read(this.piiFieldKey)?.value?.totalCount;
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
    deferredId: DeferredId | undefined,
  ): Promise<void> | undefined => {
    if (process.env.NODE_ENV !== "production") {
      this.logger?.child({ methodName: "maybeUpdateAndRevalidate" }).debug(
        DEBUG_ONLY__changesToString(changes),
      );
      this.logger?.child({ methodName: "maybeUpdateAndRevalidate" }).debug(
        `Already in changes? ${changes.modified.has(this.piiFieldKey)}`,
      );
    }

    if (changes.modified.has(this.piiFieldKey)) {
      return;
    }
    changes.modified.add(this.piiFieldKey);

    try {
      if (this.#requiresServerEvaluation) {
        return this.#handleServerRevalidation(changes);
      }
      return this.#handleLocalUpdate(changes, deferredId);
    } finally {
      if (process.env.NODE_ENV !== "production") {
        this.logger?.child({ methodName: "maybeUpdateAndRevalidate" })
          .debug("in finally");
      }
    }
  };

  #handleServerRevalidation(changes: Changes): Promise<void> | undefined {
    for (const piiFieldType of this.#piiFieldTypes) {
      const added = changes.addedObjects.get(piiFieldType);
      const modified = changes.modifiedObjects.get(piiFieldType);
      if ((added && added.length > 0) || (modified && modified.length > 0)) {
        return this.revalidate(true);
      }
    }

    for (const deletedKey of changes.deleted) {
      if (
        deletedKey.type === "object"
        && this.#piiFieldTypes.has(deletedKey.otherKeys[OBJECT_API_NAME_IDX])
      ) {
        return this.revalidate(true);
      }
    }

    return undefined;
  }

  #getRelevantChanges(
    changes: Changes,
  ):
    | { addedObjects: ScrubRecord[]; modifiedObjects: ScrubRecord[] }
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
    deferredId: DeferredId | undefined,
  ): Promise<void> | undefined {
    const whereClause = this.#operations.where as
      | ScrubNormalized<SimpleWhereClause>
      | undefined;
    const effectiveWhere = whereClause
      ?? this.store.whereScrubNormalizer.scrubNormalize({ $and: [] });

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

    const status = deferredId
        || addedMatches.uncertain.size > 0
        || modifiedMatches.uncertain.size > 0
      ? "loading"
      : "loaded";

    const { retVal: needsRevalidation } = this.store.batch(
      { deferredId, changes },
      (batch) => {
        const existingKeys = new Set(
          batch.read(this.piiFieldKey)?.value?.data,
        );

        const { newScrubField, needsRevalidation } = reconcileScrubFieldChanges(
          existingKeys,
          addedMatches.definite,
          relevant.modifiedObjects,
          modifiedMatches,
          changes.deleted,
          batch.deferredWrite,
          (obj) => this.#getObjectPiiFieldKey(obj),
        );

        const existingTotalCount = batch.read(this.piiFieldKey)?.value?.totalCount;
        this._updateScrubField(
          newScrubField,
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
    objects: ReadonlyArray<ScrubRecord | InterfaceHolder>,
    whereClause: ScrubNormalized<SimpleWhereClause>,
  ): {
    definite: ReadonlySet<ScrubRecord | InterfaceHolder>;
    uncertain: ReadonlySet<ScrubRecord | InterfaceHolder>;
  } {
    const definite = new Set<ScrubRecord | InterfaceHolder>();
    const uncertain = new Set<ScrubRecord | InterfaceHolder>();
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
      const { invalidationSet } = await getPiiFieldTypesThatInvalidate(
        this.store.client[additionalContext],
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

  #getObjectPiiFieldKey(
    obj: { $piiFieldType: string; $piiKey: string | number },
  ): ObjectPiiFieldKey {
    const pk = obj.$piiKey;
    return this.piiFieldKeys.get<ObjectPiiFieldKey>(
      "object",
      obj.$piiFieldType,
      pk,
      this.rdpConfig ?? undefined,
    );
  }

  invalidatePiiFieldType = async (
    piiFieldType: string,
    changes: Changes | undefined,
  ): Promise<void> => {
    if (
      this.#piiFieldTypes.has(piiFieldType)
      || (this.#rdpInvalidationSet?.has(piiFieldType) ?? false)
    ) {
      changes?.modified.add(this.piiFieldKey);
      return this.revalidate(true);
    }
    return Promise.resolve();
  };

  protected createPayload(
    params: {
      resolvedData: any[] | undefined;
      isDeferred: boolean;
      status: Status;
      lastUpdated: number;
      totalCount?: string;
    },
  ): ObjectSetPayload {
    return {
      resolvedScrubField: params.resolvedData,
      isDeferred: params.isDeferred,
      fetchMore: this.fetchMore,
      hasMore: this.nextPageToken != null,
      status: params.status,
      lastUpdated: params.lastUpdated,
      pipelineSet: this.#composedPipelineSet,
      totalCount: params.totalCount,
    };
  }
}

function reconcileScrubFieldChanges(
  existingKeys: ReadonlySet<ObjectPiiFieldKey>,
  addedDefiniteMatches: ReadonlySet<ScrubRecord | InterfaceHolder>,
  modifiedObjects: ReadonlyArray<ScrubRecord>,
  modifiedMatches: {
    definite: ReadonlySet<ScrubRecord | InterfaceHolder>;
    uncertain: ReadonlySet<ScrubRecord | InterfaceHolder>;
  },
  deleted: ReadonlySet<PiiFieldKey>,
  isDeferred: boolean,
  getObjectPiiFieldKey: (
    obj: ScrubRecord | InterfaceHolder,
  ) => ObjectPiiFieldKey,
): { newScrubField: ObjectPiiFieldKey[]; needsRevalidation: boolean } {
  const objectsToInsert = new Set<ScrubRecord | InterfaceHolder>(
    addedDefiniteMatches,
  );
  const keysToRemove = new Set<PiiFieldKey>(deleted);

  let needsRevalidation = false;
  for (const obj of modifiedObjects) {
    if (modifiedMatches.definite.has(obj)) {
      if (!existingKeys.has(getObjectPiiFieldKey(obj))) {
        objectsToInsert.add(obj);
      }
    } else if (!isDeferred) {
      keysToRemove.add(getObjectPiiFieldKey(obj));
      if (modifiedMatches.uncertain.has(obj)) {
        needsRevalidation = true;
      }
    }
  }

  const newScrubField: ObjectPiiFieldKey[] = [];
  for (const key of existingKeys) {
    if (!keysToRemove.has(key)) {
      newScrubField.push(key);
    }
  }
  for (const obj of objectsToInsert) {
    newScrubField.push(getObjectPiiFieldKey(obj));
  }

  return { newScrubField, needsRevalidation };
}
