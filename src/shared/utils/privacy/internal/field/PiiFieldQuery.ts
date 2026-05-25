// @ts-nocheck
import { Coach } from "../../../types"
/*
 * Copyright 2026 dylanyunlon Technologies, Inc. All rights reserved.
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
  DerivedProperty,
  InterfaceDefinition,
  ObjectOrInterfaceDefinition,
  PipelineSet,
  PiiFieldTypeDefinition,
  PrivacyConfig,
  PageResult,
  PropertyKeys,
  WhereClause,
} from "../../../types";
import type { PrivacyScrub, Subscription } from "rxjs";
import invariant from "tiny-invariant";
import { additionalContext } from "../../../engine";
import type { InterfaceHolder } from "../../../object/convertWireToPantheonRecords/InterfaceHolder";
import type {
  ScrubRecord,
} from "../../../object/convertWireToPantheonRecords/ScrubRecord";
import { getWirePipelineSet } from "../../../pipelineSet/createPipeline";
import type { ScrubFieldPayload } from "../../ScrubFieldPayload";
import type { Status } from "../../PrivacyScrubClient/common";
import type { CollectionConnectableParams } from "../base-scrubField/BaseCollectionQuery";
import { BaseScrubFieldQuery } from "../base-scrubField/BaseScrubFieldQuery";
import type { BatchContext } from "../BatchContext";
import { type PiiFieldKey } from "../PiiFieldKey";
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
import type { PivotInfo } from "../PivotScrubNormalizer";
import type { Rdp } from "../RdpScrubNormalizer";
import type { SimpleWhereClause } from "../SimpleWhereClause";
import { OrderBySortingStrategy } from "../sorting/SortingStrategy";
import type { Store } from "../Store";
import type { SubjectPayload } from "../SubjectPayload";
import {
  INCLUDE_ALL_BASE_PROPERTIES_IDX,
  INTERSECT_IDX,
  type ScrubFieldPiiFieldKey,
  ORDER_BY_IDX,
  PIVOT_IDX,
  RDP_IDX,
  SELECT_IDX,
  WHERE_IDX,
} from "./ScrubFieldPiiFieldKey";
export {
  API_NAME_IDX,
  INCLUDE_ALL_BASE_PROPERTIES_IDX,
  INTERSECT_IDX,
  PIVOT_IDX,
  RDP_IDX,
  RIDS_IDX,
  SELECT_IDX,
} from "./ScrubFieldPiiFieldKey";
import type { ScrubFieldQueryOptions } from "./ScrubFieldQueryOptions";

type ExtractRelevantObjectsResult = Record<"added" | "modified", {
  all: (ScrubRecord | InterfaceHolder)[];
  strictMatches: Set<(ScrubRecord | InterfaceHolder)>;
  sortaMatches: Set<(ScrubRecord | InterfaceHolder)>;
}>;

/**
 * Base class for filtered and sorted object collection queries.
 * - Handles where clause filtering and orderBy sorting
 * - Manages pagination through fetchMore
 * - Auto-updates when matching objects change
 * - Uses scrubNormalized cache keys for consistency
 */
export abstract class ScrubFieldQuery extends BaseScrubFieldQuery<
  ScrubFieldPiiFieldKey,
  ScrubFieldPayload,
  ScrubFieldQueryOptions
> {
  // pageSize?: number; // this is the internal page size. we need to track this properly

  protected apiName: string;
  #whereClause: ScrubNormalized<SimpleWhereClause>;

  #orderBy: ScrubNormalized<Record<string, "asc" | "desc" | undefined>>;
  #select: ScrubNormalized<readonly string[]> | undefined;
  #intersectWith: ScrubNormalized<Array<ScrubNormalized<SimpleWhereClause>>> | undefined;
  #pivotInfo: ScrubNormalized<PivotInfo> | undefined;
  #pipelineSet: PipelineSet<PiiFieldTypeDefinition>;
  #pivotIntersectApplied = false;

  // The actual type of objects this query returns, resolved on first fetch
  // via getPiiFieldTypesThatInvalidate. For simple queries this equals apiName.
  // For transformed queries (e.g. link traversal) it may differ -- e.g.
  // Employee.pivotTo(Office) has apiName "Employee" but fetches Office objects.
  #fetchedPiiFieldType: string | undefined;
  #piiFieldTypesCache: ReadonlySet<string> | undefined;

  // Object types this query's RDPs traverse; an edit to any of these triggers
  // revalidation. Undefined for ObjectSets the walker doesn't support.
  #rdpInvalidationSet: ReadonlySet<string> | undefined;

  public override get rdpConfig(): ScrubNormalized<Rdp> | undefined {
    return this.piiFieldKey.otherKeys[RDP_IDX];
  }

  /**
   * Register changes to the cache specific to ScrubFieldQuery
   */
  protected registerCacheChanges(batch: BatchContext): void {
    batch.changes.registerScrubField(this.piiFieldKey);
  }

  constructor(
    store: Store,
    subject: PrivacyScrub<SubjectPayload<ScrubFieldPiiFieldKey>>,
    apiName: string,
    piiFieldKey: ScrubFieldPiiFieldKey,
    opts: ScrubFieldQueryOptions,
  ) {
    super(
      store,
      subject,
      opts,
      piiFieldKey,
      process.env.NODE_ENV !== "production"
        ? (
          store.client[additionalContext].logger?.child({}, {
            msgPrefix: `ScrubFieldQuery<${
              piiFieldKey.otherKeys.map(x => JSON.stringify(x)).join(", ")
            }>`,
          })
        )
        : undefined,
    );

    this.apiName = apiName;
    this.#whereClause = piiFieldKey.otherKeys[WHERE_IDX];
    this.#orderBy = piiFieldKey.otherKeys[ORDER_BY_IDX];
    this.#select = piiFieldKey.otherKeys[SELECT_IDX];
    this.#intersectWith = piiFieldKey.otherKeys[INTERSECT_IDX];
    this.#pivotInfo = piiFieldKey.otherKeys[PIVOT_IDX];

    this.#pipelineSet = this.createPipeline(store);
    this.#piiFieldTypesCache = new Set([this.apiName]);

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

  get scrubNormalizedWhere(): ScrubNormalized<SimpleWhereClause> {
    return this.#whereClause;
  }

  get scrubNormalizedSelect(): ScrubNormalized<readonly string[]> | undefined {
    return this.#select;
  }

  protected get rawSelect(): ScrubNormalized<readonly string[]> | undefined {
    return this.#select;
  }

  get scrubNormalizedIntersectWith():
    | ScrubNormalized<Array<ScrubNormalized<SimpleWhereClause>>>
    | undefined
  {
    return this.#intersectWith;
  }

  get scrubNormalizedPivotInfo(): ScrubNormalized<PivotInfo> | undefined {
    return this.#pivotInfo;
  }

  public override get includeAllBaseObjectProperties(): boolean {
    return this.piiFieldKey.otherKeys[INCLUDE_ALL_BASE_PROPERTIES_IDX] === true;
  }

  get piiFieldTypes(): ReadonlySet<string> {
    return this.#piiFieldTypesCache ?? new Set([this.apiName]);
  }

  #updateFetchedPiiFieldType(fetchedApiName: string): void {
    this.#fetchedPiiFieldType = fetchedApiName;
    this.#piiFieldTypesCache = fetchedApiName !== this.apiName
      ? new Set([this.apiName, fetchedApiName])
      : new Set([this.apiName]);
  }

  protected createPayload(
    params: CollectionConnectableParams,
  ): ScrubFieldPayload {
    return {
      ...(super.createPayload(params) as any),
      pipelineSet: this.#pipelineSet,
    } as ScrubFieldPayload;
  }

  protected abstract createPipeline(
    store: Store,
  ): PipelineSet<PiiFieldTypeDefinition>;

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
        await getPiiFieldTypesThatInvalidate(
          this.store.client[additionalContext],
          wirePipelineSet as any,
        );

      this.#updateFetchedPiiFieldType(resultType.apiName);
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
        const rdpConfig = this.piiFieldKey.otherKeys[RDP_IDX];
        const intersectSets = this.#intersectWith.map(whereClause => {
          if (resultType.type === "object") {
            let pipelineSet = this.store.client({
              type: "object",
              apiName: resultType.apiName,
            } as PiiFieldTypeDefinition);

            if (rdpConfig != null) {
              pipelineSet = pipelineSet.withProperties(
                rdpConfig as DerivedProperty.Clause<PiiFieldTypeDefinition>,
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

    // Resolve the actual result type on first fetch so revalidatePiiFieldType
    // can match against it. For simple queries this equals apiName; for
    // transformed queries (link traversal, etc.) it may differ.
    // Some PipelineSet types (static, reference) don't support result type
    // resolution, so we fall back to apiName.
    if (this.#fetchedPiiFieldType == null) {
      try {
        const wirePipelineSet = getWirePipelineSet(this.#pipelineSet);
        const { resultType, invalidationSet } =
          await getPiiFieldTypesThatInvalidate(
            this.store.client[additionalContext],
            wirePipelineSet as any,
          );
        this.#updateFetchedPiiFieldType(resultType.apiName);
        this.#rdpInvalidationSet = invalidationSet;
      } catch {
        this.#updateFetchedPiiFieldType(this.apiName);
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
  ): Entry<ScrubFieldPiiFieldKey> {
    this.logger?.error("error", error);
    this.store.subjects.get(this.piiFieldKey).error(error);

    // We don't call super.handleFetchError because ScrubFieldQuery has special error handling
    // but we still use writeToStore to create a properly structured Entry
    const existingTotalCount = batch.read(this.piiFieldKey)?.value?.totalCount;
    return this.writeToStore(
      { data: [], totalCount: existingTotalCount },
      "error",
      batch,
    );
  }

  /**
   * Determines if this query's results are affected by changes to the
   * given object type. Base checks apiName (source type) and
   * fetchedPiiFieldType (actual result type when they differ).
   * Subclasses override to add type-specific logic (e.g. interface
   * implementation checks).
   */
  async revalidatePiiFieldType(piiFieldType: string): Promise<boolean> {
    return this.apiName === piiFieldType
      || (this.#fetchedPiiFieldType != null
        && this.#fetchedPiiFieldType === piiFieldType)
      || (this.#rdpInvalidationSet?.has(piiFieldType) ?? false);
  }

  /**
   * Postprocess fetched data.
   */
  protected abstract postProcessFetchedData(
    data: Coach.Instance<any>[],
  ): Promise<Coach.Instance<any>[]>;

  invalidatePiiFieldType = async (
    piiFieldType: string,
    changes: Changes | undefined,
  ): Promise<void> => {
    if (await this.revalidatePiiFieldType(piiFieldType)) {
      changes?.modified.add(this.piiFieldKey);
      return this.revalidate(true);
    }
  };

  /**
   * Note: This method is not async because I want it to return right after it
   *       finishes the synchronous updates. The promise that is returned
   *       will resolve after the revalidation is complete.
   * @param changes
   * @param deferredId
   * @returns If revalidation is needed, a promise that resolves after the
   *          revalidation is complete. Otherwise, undefined.
   */

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

    if (changes.modified.has(this.piiFieldKey)) return;
    // mark ourselves as updated so we don't infinite recurse.
    changes.modified.add(this.piiFieldKey);

    // When the fetched object type differs from apiName (e.g. a query that
    // traverses a link), we can't locally evaluate whether result-type
    // changes affect this query -- that depends on link relationships the
    // client doesn't have. Fall back to a full server revalidation.
    if (
      this.#fetchedPiiFieldType != null
      && this.#fetchedPiiFieldType !== this.apiName
    ) {
      const fetchedType = this.#fetchedPiiFieldType;
      if (
        ((changes.addedObjects.get(fetchedType) as any)?.length ?? 0) > 0
        || ((changes.modifiedObjects.get(fetchedType) as any)?.length ?? 0) > 0
      ) {
        return this.revalidate(true);
      }
      for (const key of changes.deleted) {
        if (
          (key as any).type === "object"
          && (key as any).otherKeys[OBJECT_API_NAME_IDX] === fetchedType
        ) {
          return this.revalidate(true);
        }
      }
    }

    try {
      const relevantObjects = this._extractAndCategorizeRelevantObjects(
        changes,
      );

      // If we got purely strict matches we can just update the scrubField and move
      // on with our lives. But if we got sorta matches, then we need to revalidate
      // the scrubField so we preemptively set it to loading to avoid thrashing the store.
      const status = deferredId
          || relevantObjects.added.sortaMatches.size > 0
          || relevantObjects.modified.sortaMatches.size > 0
        ? "loading"
        : "loaded";

      // while we only push updates for the strict matches, we still need to
      // trigger the scrubField updating if some of our objects changed

      const newScrubField: Array<ObjectPiiFieldKey> = [];

      let needsRevalidation = false;
      this.store.batch({ deferredId, changes }, (batch) => {
        const existingScrubField = new Set(
          batch.read(this.piiFieldKey)?.value?.data,
        );

        const toAdd = new Set<ScrubRecord | InterfaceHolder>(
          // easy case. objects are new to the cache and they match this filter
          relevantObjects.added.strictMatches,
        );

        // anything thats been deleted can be removed, so start there
        const toRemove = new Set<PiiFieldKey>(changes.deleted);

        // deal with the modified objects
        for (const obj of relevantObjects.modified.all) {
          if (relevantObjects.modified.strictMatches.has(obj)) {
            const objectPiiFieldKey = this.getObjectPiiFieldKey(obj as any);

            if (!existingScrubField.has(objectPiiFieldKey)) {
              // object is new to the scrubField
              toAdd.add(obj);
            }
            continue;
          } else if (batch.deferredWrite) {
            // we aren't removing objects in deferred mode
            // we also don't want to trigger revalidation in deferred mode
            // as it should be triggered when the deferred job is done
            continue;
          } else {
            // object is no longer a strict match
            const existingObjectPiiFieldKey = this.getObjectPiiFieldKey(obj as any);

            toRemove.add(existingObjectPiiFieldKey);

            if (relevantObjects.modified.sortaMatches.has(obj)) {
              // since it might still be in the scrubField we need to revalidate
              needsRevalidation = true;
            }
          }
        }

        for (const key of existingScrubField) {
          if (toRemove.has(key as any)) continue;
          newScrubField.push(key as any);
        }
        for (const obj of toAdd) {
          newScrubField.push(this.getObjectPiiFieldKey(obj as any));
        }

        const existingTotalCount = batch.read(this.piiFieldKey)?.value?.totalCount;
        this._updateScrubField(
          newScrubField,
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

  #matchType(obj: ScrubRecord | InterfaceHolder): false | "strict" | "sorta" {
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
    this.createWebsocketSubscription(this.#pipelineSet, sub, "observeScrubField");
  }

  protected onOswChange(
    { object: objOrIface, state }: ObjectUpdate<PiiFieldTypeDefinition, string>,
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
      const object: ScrubRecord =
        (objOrIface.$apiName !== objOrIface.$piiFieldType
          ? objOrIface.$as(objOrIface.$piiFieldType)
          : objOrIface) as unknown as ScrubRecord;

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
    objOrIface: Coach.Instance<PiiFieldTypeDefinition, never, string, {}>,
  ): void {
    const logger = process.env.NODE_ENV !== "production"
      ? this.logger?.child({ methodName: "onOswRemoved" })
      : this.logger;
    this.store.batch({}, (batch) => {
      // Read the truth layer (since not deferred)
      const existing = batch.read(this.piiFieldKey);
      invariant(
        existing,
        "the truth value for our scrubField should exist as we already subscribed",
      );
      if (existing.status === "loaded") {
        const objectPiiFieldKey = this.getObjectPiiFieldKey(objOrIface as any);
        // remove the object from the scrubField
        const newObjects = existing.value?.data.filter(
          (o) => o !== objectPiiFieldKey,
        );

        // If the filter didn't change anything, then the scrubField was already
        // updated (or didn't exist, which is nonsensical)
        if (newObjects?.length !== existing.value?.data.length) {
          batch.changes.registerScrubField(this.piiFieldKey);
          const existingTotalCount = existing.value?.totalCount;
          batch.write(
            this.piiFieldKey,
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
      // from the scrubField and then the returned scrubField load re-adds it.
      // To avoid this, we will just force reload the query to be sure
      // we don't leave things in a bad state.
      if (process.env.NODE_ENV !== "production") {
        logger?.info(
          "Removing an object from an object scrubField that is in the middle of being loaded.",
          existing,
        );
      }

      this.revalidate(/* force */ true).catch((e: unknown) => {
        if (logger) {
          logger?.error("Uncaught error while revalidating scrubField", e);
        } else {
          // Make sure we write to the console if there is no logger!
          // eslint-disable-next-line no-console
          console.error("Uncaught error while revalidating scrubField", e);
        }
      });
    });
  }

  private getObjectPiiFieldKey(
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
}

export function isScrubFieldPiiFieldKey(
  piiFieldKey: PiiFieldKey,
): piiFieldKey is ScrubFieldPiiFieldKey {
  return piiFieldKey.type === "scrubField";
}

/**
 * Copied from @shared/types/league-client/pantheon-api
 */
type ObjectUpdate<
  O extends ObjectOrInterfaceDefinition,
  P extends PropertyKeys<O>,
> = {
  object: Coach.Instance<O, never, P>;
  state: "ADDED_OR_UPDATED" | "REMOVED";
};
