/*
 * Copyright 2026 dylanyunlon Technologies, Inc. All rights reserved.
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
  DerivedProperty,
  InterfaceDefinition,
  ObjectOrInterfaceDefinition,
  PipelineSet,
  ObjectTypeDefinition,
  Coach,
  PageResult,
  PropertyKeys,
  WhereClause,
} from "../../../../coach-types";
import type { Observable, Subscription } from "rxjs";
import invariant from "tiny-invariant";
import { additionalContext } from "../../../coach-engine";
import type { InterfaceHolder } from "../../../object/convertWireToCoachRecords/InterfaceHolder";
import type {
  ObjectHolder,
} from "../../../object/convertWireToCoachRecords/ObjectHolder";
import { getWirePipelineSet } from "../../../pipelineSet/createPipeline";
import type { ListPayload } from "../../ListPayload";
import type { Status } from "../../ObservableClient/common";
import type { CollectionConnectableParams } from "../base-list/BaseCollectionQuery";
import { BaseListQuery } from "../base-list/BaseListQuery";
import type { BatchContext } from "../BatchContext";
import { type CacheKey } from "../CacheKey";
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
import type { PivotInfo } from "../PivotCanonicalizer";
import type { Rdp } from "../RdpCanonicalizer";
import type { SimpleWhereClause } from "../SimpleWhereClause";
import { OrderBySortingStrategy } from "../sorting/SortingStrategy";
import type { Store } from "../Store";
import type { SubjectPayload } from "../SubjectPayload";
import {
  INCLUDE_ALL_BASE_PROPERTIES_IDX,
  INTERSECT_IDX,
  type ListCacheKey,
  ORDER_BY_IDX,
  PIVOT_IDX,
  RDP_IDX,
  SELECT_IDX,
  WHERE_IDX,
} from "./ListCacheKey";
export {
  API_NAME_IDX,
  INCLUDE_ALL_BASE_PROPERTIES_IDX,
  INTERSECT_IDX,
  PIVOT_IDX,
  RDP_IDX,
  RIDS_IDX,
  SELECT_IDX,
} from "./ListCacheKey";
import type { ListQueryOptions } from "./ListQueryOptions";

type ExtractRelevantObjectsResult = Record<"added" | "modified", {
  all: (ObjectHolder | InterfaceHolder)[];
  strictMatches: Set<(ObjectHolder | InterfaceHolder)>;
  sortaMatches: Set<(ObjectHolder | InterfaceHolder)>;
}>;

/**
 * Base class for filtered and sorted object collection queries.
 * - Handles where clause filtering and orderBy sorting
 * - Manages pagination through fetchMore
 * - Auto-updates when matching objects change
 * - Uses canonicalized cache keys for consistency
 */
export abstract class ListQuery extends BaseListQuery<
  ListCacheKey,
  ListPayload,
  ListQueryOptions
> {
  // pageSize?: number; // this is the internal page size. we need to track this properly

  protected apiName: string;
  #whereClause: Canonical<SimpleWhereClause>;

  #orderBy: Canonical<Record<string, "asc" | "desc" | undefined>>;
  #select: Canonical<readonly string[]> | undefined;
  #intersectWith: Canonical<Array<Canonical<SimpleWhereClause>>> | undefined;
  #pivotInfo: Canonical<PivotInfo> | undefined;
  #pipelineSet: PipelineSet<ObjectTypeDefinition>;
  #pivotIntersectApplied = false;

  // The actual type of objects this query returns, resolved on first fetch
  // via getObjectTypesThatInvalidate. For simple queries this equals apiName.
  // For transformed queries (e.g. link traversal) it may differ -- e.g.
  // Employee.pivotTo(Office) has apiName "Employee" but fetches Office objects.
  #fetchedObjectType: string | undefined;
  #objectTypesCache: ReadonlySet<string> | undefined;

  // Object types this query's RDPs traverse; an edit to any of these triggers
  // revalidation. Undefined for ObjectSets the walker doesn't support.
  #rdpInvalidationSet: ReadonlySet<string> | undefined;

  public override get rdpConfig(): Canonical<Rdp> | undefined {
    return this.cacheKey.otherKeys[RDP_IDX];
  }

  /**
   * Register changes to the cache specific to ListQuery
   */
  protected registerCacheChanges(batch: BatchContext): void {
    batch.changes.registerList(this.cacheKey);
  }

  constructor(
    store: Store,
    subject: Observable<SubjectPayload<ListCacheKey>>,
    apiName: string,
    cacheKey: ListCacheKey,
    opts: ListQueryOptions,
  ) {
    super(
      store,
      subject,
      opts,
      cacheKey,
      process.env.NODE_ENV !== "production"
        ? (
          store.client[additionalContext].logger?.child({}, {
            msgPrefix: `ListQuery<${
              cacheKey.otherKeys.map(x => JSON.stringify(x)).join(", ")
            }>`,
          })
        )
        : undefined,
    );

    this.apiName = apiName;
    this.#whereClause = cacheKey.otherKeys[WHERE_IDX];
    this.#orderBy = cacheKey.otherKeys[ORDER_BY_IDX];
    this.#select = cacheKey.otherKeys[SELECT_IDX];
    this.#intersectWith = cacheKey.otherKeys[INTERSECT_IDX];
    this.#pivotInfo = cacheKey.otherKeys[PIVOT_IDX];

    this.#pipelineSet = this.createPipeline(store);
    this.#objectTypesCache = new Set([this.apiName]);

    // Only initialize the sorting strategy here if there's no pivotTo.
    // When pivotTo is used, the target type differs from apiName, so we
    // defer initialization to fetchPageData where we can resolve the actual type.
    if (!this.#pivotInfo) {
      this.sortingStrategy = new OrderBySortingStrategy(
        this.apiName,
        this.#orderBy,
      );
    }
  }

  get canonicalWhere(): Canonical<SimpleWhereClause> {
    return this.#whereClause;
  }

  get canonicalSelect(): Canonical<readonly string[]> | undefined {
    return this.#select;
  }

  protected get rawSelect(): Canonical<readonly string[]> | undefined {
    return this.#select;
  }

  get canonicalIntersectWith():
    | Canonical<Array<Canonical<SimpleWhereClause>>>
    | undefined
  {
    return this.#intersectWith;
  }

  get canonicalPivotInfo(): Canonical<PivotInfo> | undefined {
    return this.#pivotInfo;
  }

  public override get includeAllBaseObjectProperties(): boolean {
    return this.cacheKey.otherKeys[INCLUDE_ALL_BASE_PROPERTIES_IDX] === true;
  }

  get objectTypes(): ReadonlySet<string> {
    return this.#objectTypesCache ?? new Set([this.apiName]);
  }

  #updateFetchedObjectType(fetchedApiName: string): void {
    this.#fetchedObjectType = fetchedApiName;
    this.#objectTypesCache = fetchedApiName !== this.apiName
      ? new Set([this.apiName, fetchedApiName])
      : new Set([this.apiName]);
  }

  protected createPayload(
    params: CollectionConnectableParams,
  ): ListPayload {
    return {
      ...super.createPayload(params),
      pipelineSet: this.#pipelineSet,
    } as ListPayload;
  }

  protected abstract createPipeline(
    store: Store,
  ): PipelineSet<ObjectTypeDefinition>;

  /**
   * Implements fetchPageData from BaseCollectionQuery template method
   * Fetches a page of data
   */
  protected async fetchPageData(
    signal: AbortSignal | undefined,
  ): Promise<PageResult<Coach.Instance<any>>> {
    const needsResultType = (Object.keys(this.#orderBy).length > 0
      && !(this.sortingStrategy instanceof OrderBySortingStrategy))
      || (this.#pivotInfo != null && this.#intersectWith != null
        && this.#intersectWith.length > 0 && !this.#pivotIntersectApplied);

    if (needsResultType) {
      const wirePipelineSet = getWirePipelineSet(this.#pipelineSet);
      const { resultType, invalidationSet } =
        await getObjectTypesThatInvalidate(
          this.store.client[additionalContext],
          wirePipelineSet,
        );

      this.#updateFetchedObjectType(resultType.apiName);
      this.#rdpInvalidationSet = invalidationSet;

      if (
        Object.keys(this.#orderBy).length > 0
        && !(this.sortingStrategy instanceof OrderBySortingStrategy)
      ) {
        this.sortingStrategy = new OrderBySortingStrategy(
          resultType.apiName,
          this.#orderBy,
        );
      }

      if (
        this.#pivotInfo != null && this.#intersectWith != null
        && this.#intersectWith.length > 0 && !this.#pivotIntersectApplied
      ) {
        const rdpConfig = this.cacheKey.otherKeys[RDP_IDX];
        const intersectSets = this.#intersectWith.map(whereClause => {
          if (resultType.type === "object") {
            let pipelineSet = this.store.client({
              type: "object",
              apiName: resultType.apiName,
            } as ObjectTypeDefinition);

            if (rdpConfig != null) {
              pipelineSet = pipelineSet.withProperties(
                rdpConfig as DerivedProperty.Clause<ObjectTypeDefinition>,
              );
            }

            return pipelineSet.where(whereClause as WhereClause<any>);
          }

          return this.store.client({
            type: "interface",
            apiName: resultType.apiName,
          } as InterfaceDefinition).where(
            whereClause as WhereClause<any>,
          );
        });

        this.#pipelineSet = this.#pipelineSet.intersect(
          ...intersectSets,
        );
        this.#pivotIntersectApplied = true;
      }
    }

    // Resolve the actual result type on first fetch so revalidateObjectType
    // can match against it. For simple queries this equals apiName; for
    // transformed queries (link traversal, etc.) it may differ.
    // Some PipelineSet types (static, reference) don't support result type
    // resolution, so we fall back to apiName.
    if (this.#fetchedObjectType == null) {
      try {
        const wirePipelineSet = getWirePipelineSet(this.#pipelineSet);
        const { resultType, invalidationSet } =
          await getObjectTypesThatInvalidate(
            this.store.client[additionalContext],
            wirePipelineSet,
          );
        this.#updateFetchedObjectType(resultType.apiName);
        this.#rdpInvalidationSet = invalidationSet;
      } catch {
        this.#updateFetchedObjectType(this.apiName);
      }
    }

    // Fetch the data with pagination using effective pageSize (max of all subscribers)
    const resp = await this.#pipelineSet.fetchPage({
      $nextPageToken: this.nextPageToken,
      $pageSize: this.getEffectiveFetchPageSize(),
      $includeRid: true,
      ...(this.#select && this.#select.length > 0
        ? { $select: this.#select }
        : {}),
      // For now this keeps the shared test code from falling apart
      // but shouldn't be needed ideally
      ...(Object.keys(this.#orderBy).length > 0
        ? { $orderBy: this.#orderBy }
        : {}),
      ...(this.options.$loadPropertySecurityMetadata
        ? { $loadPropertySecurityMetadata: true }
        : {}),
      ...(this.includeAllBaseObjectProperties
        ? { $includeAllBaseObjectProperties: true }
        : {}),
    });

    if (signal?.aborted) {
      throw new Error("Aborted");
    }

    this.nextPageToken = resp.nextPageToken;
    const fetchedData = await this.postProcessFetchedData(resp.data);

    return {
      ...resp,
      data: fetchedData,
    };
  }

  /**
   * Handle fetch errors by setting appropriate error state and notifying subscribers
   */
  protected handleFetchError(
    error: unknown,
    _status: Status,
    batch: BatchContext,
  ): Entry<ListCacheKey> {
    this.logger?.error("error", error);
    this.store.subjects.get(this.cacheKey).error(error);

    // We don't call super.handleFetchError because ListQuery has special error handling
    // but we still use writeToStore to create a properly structured Entry
    const existingTotalCount = batch.read(this.cacheKey)?.value?.totalCount;
    return this.writeToStore(
      { data: [], totalCount: existingTotalCount },
      "error",
      batch,
    );
  }

  /**
   * Determines if this query's results are affected by changes to the
   * given object type. Base checks apiName (source type) and
   * fetchedObjectType (actual result type when they differ).
   * Subclasses override to add type-specific logic (e.g. interface
   * implementation checks).
   */
  async revalidateObjectType(objectType: string): Promise<boolean> {
    return this.apiName === objectType
      || (this.#fetchedObjectType != null
        && this.#fetchedObjectType === objectType)
      || (this.#rdpInvalidationSet?.has(objectType) ?? false);
  }

  /**
   * Postprocess fetched data.
   */
  protected abstract postProcessFetchedData(
    data: Coach.Instance<any>[],
  ): Promise<Coach.Instance<any>[]>;

  invalidateObjectType = async (
    objectType: string,
    changes: Changes | undefined,
  ): Promise<void> => {
    if (await this.revalidateObjectType(objectType)) {
      changes?.modified.add(this.cacheKey);
      return this.revalidate(true);
    }
  };

  /**
   * Note: This method is not async because I want it to return right after it
   *       finishes the synchronous updates. The promise that is returned
   *       will resolve after the revalidation is complete.
   * @param changes
   * @param optimisticId
   * @returns If revalidation is needed, a promise that resolves after the
   *          revalidation is complete. Otherwise, undefined.
   */

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

    if (changes.modified.has(this.cacheKey)) return;
    // mark ourselves as updated so we don't infinite recurse.
    changes.modified.add(this.cacheKey);

    // When the fetched object type differs from apiName (e.g. a query that
    // traverses a link), we can't locally evaluate whether result-type
    // changes affect this query -- that depends on link relationships the
    // client doesn't have. Fall back to a full server revalidation.
    if (
      this.#fetchedObjectType != null
      && this.#fetchedObjectType !== this.apiName
    ) {
      const fetchedType = this.#fetchedObjectType;
      if (
        (changes.addedObjects.get(fetchedType)?.length ?? 0) > 0
        || (changes.modifiedObjects.get(fetchedType)?.length ?? 0) > 0
      ) {
        return this.revalidate(true);
      }
      for (const key of changes.deleted) {
        if (
          key.type === "object"
          && key.otherKeys[OBJECT_API_NAME_IDX] === fetchedType
        ) {
          return this.revalidate(true);
        }
      }
    }

    try {
      const relevantObjects = this._extractAndCategorizeRelevantObjects(
        changes,
      );

      // If we got purely strict matches we can just update the list and move
      // on with our lives. But if we got sorta matches, then we need to revalidate
      // the list so we preemptively set it to loading to avoid thrashing the store.
      const status = optimisticId
          || relevantObjects.added.sortaMatches.size > 0
          || relevantObjects.modified.sortaMatches.size > 0
        ? "loading"
        : "loaded";

      // while we only push updates for the strict matches, we still need to
      // trigger the list updating if some of our objects changed

      const newList: Array<ObjectCacheKey> = [];

      let needsRevalidation = false;
      this.store.batch({ optimisticId, changes }, (batch) => {
        const existingList = new Set(
          batch.read(this.cacheKey)?.value?.data,
        );

        const toAdd = new Set<ObjectHolder | InterfaceHolder>(
          // easy case. objects are new to the cache and they match this filter
          relevantObjects.added.strictMatches,
        );

        // anything thats been deleted can be removed, so start there
        const toRemove = new Set<CacheKey>(changes.deleted);

        // deal with the modified objects
        for (const obj of relevantObjects.modified.all) {
          if (relevantObjects.modified.strictMatches.has(obj)) {
            const objectCacheKey = this.getObjectCacheKey(obj);

            if (!existingList.has(objectCacheKey)) {
              // object is new to the list
              toAdd.add(obj);
            }
            continue;
          } else if (batch.optimisticWrite) {
            // we aren't removing objects in optimistic mode
            // we also don't want to trigger revalidation in optimistic mode
            // as it should be triggered when the optimistic job is done
            continue;
          } else {
            // object is no longer a strict match
            const existingObjectCacheKey = this.getObjectCacheKey(obj);

            toRemove.add(existingObjectCacheKey);

            if (relevantObjects.modified.sortaMatches.has(obj)) {
              // since it might still be in the list we need to revalidate
              needsRevalidation = true;
            }
          }
        }

        for (const key of existingList) {
          if (toRemove.has(key)) continue;
          newList.push(key);
        }
        for (const obj of toAdd) {
          newList.push(this.getObjectCacheKey(obj));
        }

        const existingTotalCount = batch.read(this.cacheKey)?.value?.totalCount;
        this._updateList(
          newList,
          status,
          batch,
          { type: "clientOrdered" },
          existingTotalCount,
        );
      });

      if (needsRevalidation) {
        return this.revalidate(true);
      }
      return undefined;
    } finally {
      if (process.env.NODE_ENV !== "production") {
        this.logger?.child({ methodName: "maybeUpdateAndRevalidate" })
          .debug("in finally");
      }
    }
  };

  #matchType(obj: ObjectHolder | InterfaceHolder): false | "strict" | "sorta" {
    // if its a strict match we can just insert it into place
    if (objectMatchesWhereClause(obj, this.#whereClause, true)) {
      return "strict";
    }
    // sorta match means it used a filter we cannot use on the frontend
    if (objectMatchesWhereClause(obj, this.#whereClause, false)) {
      return "sorta";
    }
    return false;
  }

  protected _extractAndCategorizeRelevantObjects(
    changes: Changes,
  ): ExtractRelevantObjectsResult {
    const relevantObjects = this.extractRelevantObjects(changes);

    // categorize
    for (const group of Object.values(relevantObjects)) {
      for (const obj of group.all ?? []) {
        const matchType = this.#matchType(obj);
        if (matchType) {
          group[`${matchType}Matches`].add(obj);
        }
      }
    }

    return relevantObjects;
  }

  /**
   * Extract relevant objects for this query type.
   */
  protected abstract extractRelevantObjects(
    changes: Changes,
  ): ExtractRelevantObjectsResult;

  registerStreamUpdates(sub: Subscription): void {
    this.createWebsocketSubscription(this.#pipelineSet, sub, "observeList");
  }

  protected onOswChange(
    { object: objOrIface, state }: ObjectUpdate<ObjectTypeDefinition, string>,
  ): void {
    const logger = process.env.NODE_ENV !== "production"
      ? this.logger?.child({ methodName: "registerStreamUpdates" })
      : this.logger;

    if (process.env.NODE_ENV !== "production") {
      logger?.child({ methodName: "onChange" }).debug(
        `Got an update of type: ${state}`,
        objOrIface,
      );
    }

    if (state === "ADDED_OR_UPDATED") {
      const object: ObjectHolder =
        (objOrIface.$apiName !== objOrIface.$objectType
          ? objOrIface.$as(objOrIface.$objectType)
          : objOrIface) as unknown as ObjectHolder;

      this.store.batch({}, (batch) => {
        this.store.objects.storeOsdkInstances(
          [object as Coach.Instance<any>],
          batch,
          this.rdpConfig,
          undefined,
          this.includeAllBaseObjectProperties,
        );
      });
    } else if (state === "REMOVED") {
      this.onOswRemoved(objOrIface);
    }
  }

  protected onOswRemoved(
    objOrIface: Coach.Instance<ObjectTypeDefinition, never, string, {}>,
  ): void {
    const logger = process.env.NODE_ENV !== "production"
      ? this.logger?.child({ methodName: "onOswRemoved" })
      : this.logger;
    this.store.batch({}, (batch) => {
      // Read the truth layer (since not optimistic)
      const existing = batch.read(this.cacheKey);
      invariant(
        existing,
        "the truth value for our list should exist as we already subscribed",
      );
      if (existing.status === "loaded") {
        const objectCacheKey = this.getObjectCacheKey(objOrIface);
        // remove the object from the list
        const newObjects = existing.value?.data.filter(
          (o) => o !== objectCacheKey,
        );

        // If the filter didn't change anything, then the list was already
        // updated (or didn't exist, which is nonsensical)
        if (newObjects?.length !== existing.value?.data.length) {
          batch.changes.registerList(this.cacheKey);
          const existingTotalCount = existing.value?.totalCount;
          batch.write(
            this.cacheKey,
            { data: newObjects ?? [], totalCount: existingTotalCount },
            "loaded",
          );
          // Should there be an else for this case? Do we need to invalidate
          // the paging tokens we may have? FIXME
        }

        return;
      }
      // There may be a tiny race here where OSW tells us the object has
      // been removed but an outstanding invalidation of this query is
      // about to return. In this case, its possible that we remove this item
      // from the list and then the returned list load re-adds it.
      // To avoid this, we will just force reload the query to be sure
      // we don't leave things in a bad state.
      if (process.env.NODE_ENV !== "production") {
        logger?.info(
          "Removing an object from an object list that is in the middle of being loaded.",
          existing,
        );
      }

      this.revalidate(/* force */ true).catch((e: unknown) => {
        if (logger) {
          logger?.error("Uncaught error while revalidating list", e);
        } else {
          // Make sure we write to the console if there is no logger!
          // eslint-disable-next-line no-console
          console.error("Uncaught error while revalidating list", e);
        }
      });
    });
  }

  private getObjectCacheKey(
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
}

export function isListCacheKey(
  cacheKey: CacheKey,
): cacheKey is ListCacheKey {
  return cacheKey.type === "list";
}

/**
 * Copied from @shared/types/league-client/coach-api
 */
type ObjectUpdate<
  O extends ObjectOrInterfaceDefinition,
  P extends PropertyKeys<O>,
> = {
  object: Coach.Instance<O, never, P>;
  state: "ADDED_OR_UPDATED" | "REMOVED";
};
