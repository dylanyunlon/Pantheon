import { Coach } from "../../../coach-types"
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
  Logger,
  PiiFieldTypeDefinition,
  PrivacyConfig,
  PiiKeyType,
  ScrubDefinition,
} from "../../../coach-types";
import invariant from "tiny-invariant";
import type { ActionSignatureFromDef } from "../../coach-actions/applyAction";
import { additionalContext, type Client } from "../../coach-engine";
import { DEBUG_REFCOUNTS } from "../DebugFlags";
import type { CacheEntry, CacheSnapshot } from "../PrivacyScrubClient";
import type { DeferredBuilder } from "../DeferredBuilder";
import { ActionApplication } from "./actions/ActionApplication";
import {
  API_NAME_IDX as AGGREGATION_API_NAME_IDX,
  RDP_IDX as AGGREGATION_RDP_IDX,
} from "./aggregation/AggregationPiiFieldKey";
import { AggregationsHelper } from "./aggregation/AggregationsHelper";
import type { BatchContext } from "./BatchContext";
import { DEBUG_ONLY__piiFieldKeyToString } from "./PiiFieldKey";
import { PiiFieldKeys } from "./PiiFieldKeys";
import type { ScrubNormalized } from "./ScrubNormalized";
import {
  type Changes,
  createChangedObjects,
  DEBUG_ONLY__changesToString,
} from "./Changes";
import { FunctionsHelper } from "./function/FunctionsHelper";
import { GenericScrubNormalizer } from "./GenericScrubNormalizer";
import { IntersectScrubNormalizer } from "./IntersectScrubNormalizer";
import type { KnownPiiFieldKey } from "./KnownPiiFieldKey";
import type { Entry } from "./Layer";
import { Layers } from "./Layers";
import { LinksHelper } from "./links/LinksHelper";
import {
  SOURCE_API_NAME_IDX as LINK_API_NAME_IDX,
} from "./links/SpecificLinkPiiFieldKey";
import {
  API_NAME_IDX as LIST_API_NAME_IDX,
  RDP_IDX as LIST_RDP_IDX,
} from "./list/ListPiiFieldKey";
import { ListsHelper } from "./list/ListsHelper";
import { MediaHelper } from "./media/MediaHelper";
import {
  API_NAME_IDX as OBJECT_API_NAME_IDX,
  RDP_CONFIG_IDX as OBJECT_RDP_CONFIG_IDX,
} from "./object/ObjectPiiFieldKey";
import { ObjectPiiFieldKeyRegistry } from "./object/ObjectPiiFieldKeyRegistry";
import { ObjectsHelper } from "./object/ObjectsHelper";
import { ObjectSetHelper } from "./objectset/PipelineSetHelper";
import { ObjectSetArrayScrubNormalizer } from "./PipelineSetArrayScrubNormalizer";
import { type DeferredId } from "./DeferredId";
import { OrderByScrubNormalizer } from "./OrderByScrubNormalizer";
import { PivotScrubNormalizer } from "./PivotScrubNormalizer";
import { Queries } from "./Queries";
import { type Rdp, RdpScrubNormalizer } from "./RdpScrubNormalizer";
import { RidListScrubNormalizer } from "./RidListScrubNormalizer";
import { SelectScrubNormalizer } from "./SelectScrubNormalizer";
import type { Subjects } from "./Subjects";
import { WhereClauseScrubNormalizer } from "./WhereClauseScrubNormalizer";

export namespace Store {
  export interface ApplyActionOptions {
    deferredUpdate?: (ctx: DeferredBuilder) => void;
  }
}

/*
  Notes:
    - Subjects are one per type per store (by cache key)
    - Data is one per layer per cache key
*/

const __DEV__ = typeof process === "undefined"
  || process.env.NODE_ENV !== "production";

/**
 * Central data store with layered cache architecture.
 * - Truth layer: server state | Deferred layers: pending changes
 * - Reference counting prevents memory leaks
 * - Batch operations ensure consistency
 */
export class Store {
  readonly whereScrubNormalizer: WhereClauseScrubNormalizer =
    new WhereClauseScrubNormalizer();
  readonly orderByScrubNormalizer: OrderByScrubNormalizer =
    new OrderByScrubNormalizer();
  readonly rdpScrubNormalizer: RdpScrubNormalizer = new RdpScrubNormalizer();
  readonly intersectScrubNormalizer: IntersectScrubNormalizer =
    new IntersectScrubNormalizer(this.whereScrubNormalizer);
  readonly pivotScrubNormalizer: PivotScrubNormalizer = new PivotScrubNormalizer();
  readonly ridListScrubNormalizer: RidListScrubNormalizer =
    new RidListScrubNormalizer();
  readonly selectScrubNormalizer: SelectScrubNormalizer = new SelectScrubNormalizer();
  readonly objectSetArrayScrubNormalizer: ObjectSetArrayScrubNormalizer =
    new ObjectSetArrayScrubNormalizer();
  readonly genericScrubNormalizer: GenericScrubNormalizer =
    new GenericScrubNormalizer();

  readonly client: Client;

  /** @internal */
  readonly logger?: Logger;

  readonly piiFieldKeys: PiiFieldKeys<KnownPiiFieldKey>;
  readonly queries: Queries = new Queries();

  /**
   * Tracks cache keys with deferred cleanup. During React unmount-remount
   * cycles, a subscription may be cleaned up and immediately re-created.
   * By deferring cleanup to a microtask, we prevent propagateWrite from
   * skipping keys that are momentarily between subscriptions.
   *
   * The value is a count (not a boolean) so multiple unsubscribes within the
   * same tick schedule the correct number of releases.
   * @internal
   */
  readonly pendingCleanup: Map<KnownPiiFieldKey, number> = new Map();

  readonly objectPiiFieldKeyRegistry: ObjectPiiFieldKeyRegistry =
    new ObjectPiiFieldKeyRegistry();

  readonly layers: Layers = new Layers({
    logger: this.logger,
    onRevalidate: this.#maybeRevalidateQueries.bind(this),
  });
  readonly subjects: Subjects = this.layers.subjects;

  // these are hopefully temporary
  readonly aggregations: AggregationsHelper;
  readonly functions: FunctionsHelper;
  readonly lists: ListsHelper;
  readonly objects: ObjectsHelper;
  readonly links: LinksHelper;
  readonly media: MediaHelper;
  readonly objectSets: ObjectSetHelper;

  constructor(client: Client) {
    this.logger = client[additionalContext].logger?.child({}, {
      msgPrefix: "Store",
    });
    this.client = client;

    this.piiFieldKeys = new PiiFieldKeys<KnownPiiFieldKey>({
      onDestroy: this.#cleanupPiiFieldKey,
    });

    this.aggregations = new AggregationsHelper(
      this,
      this.piiFieldKeys,
      this.whereScrubNormalizer,
      this.rdpScrubNormalizer,
      this.intersectScrubNormalizer,
    );
    this.functions = new FunctionsHelper(this, this.piiFieldKeys);
    this.lists = new ListsHelper(
      this,
      this.piiFieldKeys,
      this.whereScrubNormalizer,
      this.orderByScrubNormalizer,
      this.rdpScrubNormalizer,
      this.intersectScrubNormalizer,
      this.pivotScrubNormalizer,
      this.ridListScrubNormalizer,
      this.selectScrubNormalizer,
    );
    this.objects = new ObjectsHelper(this, this.piiFieldKeys);
    this.links = new LinksHelper(
      this,
      this.piiFieldKeys,
      this.whereScrubNormalizer,
      this.orderByScrubNormalizer,
      this.selectScrubNormalizer,
    );
    this.media = new MediaHelper(this, this.piiFieldKeys);
    this.objectSets = new ObjectSetHelper(
      this,
      this.piiFieldKeys,
      this.whereScrubNormalizer,
      this.orderByScrubNormalizer,
      this.rdpScrubNormalizer,
      this.selectScrubNormalizer,
      this.objectSetArrayScrubNormalizer,
    );
  }

  /**
   * Called after a key is no longer retained and the timeout has elapsed
   * @param key
   */
  #cleanupPiiFieldKey = (key: KnownPiiFieldKey) => {
    const subject = this.subjects.peek(key);

    if (DEBUG_REFCOUNTS) {
      // eslint-disable-next-line no-console
      console.log(
        `PiiFieldKey cleaning up (${
          JSON.stringify({
            closed: subject?.closed,
            observed: subject?.observed,
          })
        })`,
        JSON.stringify([key.type, ...key.otherKeys], null, 2),
      );
    }

    if (process.env.NODE_ENV !== "production") {
      invariant(subject);
    }

    this.subjects.delete(key);
    this.queries.delete(key);

    if (key.type === "object") {
      this.objectPiiFieldKeyRegistry.unregister(key);
    }
  };

  applyAction: <Q extends ActionDefinition<any>>(
    action: Q,
    args:
      | Parameters<ActionSignatureFromDef<Q>["applyAction"]>[0]
      | Array<Parameters<ActionSignatureFromDef<Q>["applyAction"]>[0]>,
    opts?: Store.ApplyActionOptions,
  ) => Promise<ActionEditResponse> = async (action, args, opts) => {
    return await new ActionApplication(this).applyAction(action, args, opts);
  };

  validateAction: <Q extends ActionDefinition<any>>(
    action: Q,
    args: Parameters<ActionSignatureFromDef<Q>["applyAction"]>[0],
  ) => Promise<ActionValidationResponse> = async (action, args) => {
    const result = await this.client(action).applyAction(args as any, {
      $validateOnly: true,
      $returnEdits: false,
    });
    return result as ActionValidationResponse;
  };

  public getValue<K extends KnownPiiFieldKey>(
    piiFieldKey: K,
  ): Entry<K> | undefined {
    return this.layers.top.get(piiFieldKey);
  }

  batch<X>(
    { deferredId, changes = createChangedObjects() }: {
      deferredId?: DeferredId;
      changes?: Changes;
    },
    batchFn: (batchContext: BatchContext) => X,
  ): {
    batchResult: BatchContext;
    retVal: X;
    changes: Changes;
  } {
    return this.layers.batch({ deferredId, changes }, batchFn);
  }

  public invalidateObject<T extends PiiFieldTypeDefinition>(
    apiName: T["apiName"] | T,
    pk: PiiKeyType<T>,
  ): Promise<unknown> {
    if (typeof apiName !== "string") {
      apiName = apiName.apiName;
    }
    const variants = this.objectPiiFieldKeyRegistry.getVariants(apiName, pk);

    // Invalidate all variant cache entries
    // Using Promise.allSettled to ensure if one invalidation fails, others will still complete.
    // This prevents a single failing query from blocking invalidation of other cache variants for the same object.
    const promises: Promise<void>[] = [];

    if (variants.size === 0) {
      // No registered variants - create and revalidate the base variant (no RDP)
      promises.push(
        this.objects.getQuery({
          apiName,
          pk,
        }, undefined).revalidate(/* force */ true),
      );
    } else {
      // Revalidate all registered variants
      for (const key of variants) {
        const query = this.queries.peek(key);
        if (query) {
          promises.push((query as any).revalidate(/* force */ true));
        }
      }
    }

    // Per-PK invalidation doesn't propagate to specificLink queries (they're
    // keyed on srcType+srcPk+linkName, not the linked object's pk).
    promises.push(this.invalidateLinkQueriesForType(apiName));

    // Function queries with explicit `dependsOnObjects` need to be told the
    // edited PK directly — they aren't object-cache variants and so aren't
    // reachable via objectPiiFieldKeyRegistry.
    promises.push(this.functions.invalidateFunctionsByObject(apiName, pk));

    return Promise.allSettled(promises);
  }

  /**
   * Force every cached `specificLink` query to re-evaluate against the given
   * apiName. Link queries are keyed on `(srcType, srcPk, linkName, ...)` rather
   * than the linked object's pk, so per-object propagation never marks them
   * as modified.
   *
   * TODO: make SpecificLinkQuery self-invalidate from per-type changes so
   * callers don't need this manual kick.
   */
  public invalidateLinkQueriesForType(apiName: string): Promise<void> {
    if (process.env.NODE_ENV !== "production") {
      this.logger?.child({ methodName: "invalidateLinkQueriesForType" }).debug(
        apiName,
      );
    }

    const promises: Array<Promise<void>> = [];
    for (const piiFieldKey of this.queries.keys()) {
      if ((piiFieldKey as any).type !== "specificLink") {
        continue;
      }
      const query = this.queries.peek(piiFieldKey);
      if (!query) {
        continue;
      }
      promises.push((query as any).invalidatePiiFieldType(apiName, undefined));
    }
    return Promise.allSettled(promises).then(() => void 0);
  }

  async #maybeRevalidateQueries(
    changes: Changes,
    deferredId?: DeferredId | undefined,
  ): Promise<void> {
    const logger = process.env.NODE_ENV !== "production"
      ? this.logger?.child({ methodName: "maybeRevalidateQueries" })
      : undefined;

    if ((changes as any).isEmpty()) {
      if (process.env.NODE_ENV !== "production") {
        logger?.debug("No changes, aborting");
      }
      return;
    }

    if (process.env.NODE_ENV !== "production") {
      logger?.debug(DEBUG_ONLY__changesToString(changes), { deferredId });
    }

    try {
      const promises: Array<Promise<unknown>> = [];
      for (const piiFieldKey of this.queries.keys()) {
        const query = this.queries.peek(piiFieldKey);
        if (!(query as any)?.maybeUpdateAndRevalidate) {
          continue;
        }

        // Only propagate to queries that should receive these changes
        if (
          !this.#shouldPropagateToQuery(
            {
              piiFieldKey,
              maybeUpdateAndRevalidate: (query as any).maybeUpdateAndRevalidate,
            },
            changes,
            deferredId,
          )
        ) {
          continue;
        }

        const promise = (query as any).maybeUpdateAndRevalidate(changes, deferredId);
        if (promise) promises.push(promise);
      }
      await Promise.all(promises);
    } finally {
      if (process.env.NODE_ENV !== "production") {
        logger?.debug("in finally", DEBUG_ONLY__changesToString(changes));
      }
    }
  }

  /**
   * Determines whether changes should propagate to a specific query.
   * Prevents unnecessary privacyScrub pipeline execution for cross-propagation.
   *
   * @param query - The query to check
   * @param changes - The changes that occurred
   * @param deferredId - Optional deferred update ID
   * @returns true if the query should be notified of these changes
   */
  #shouldPropagateToQuery(
    query: {
      piiFieldKey: KnownPiiFieldKey;
      maybeUpdateAndRevalidate?: (
        changes: Changes,
        deferredId: DeferredId | undefined,
      ) => Promise<void> | undefined;
    },
    changes: Changes,
    deferredId?: DeferredId,
  ): boolean {
    // Always propagate deferred updates (user-initiated actions need immediate feedback)
    if (deferredId) {
      return true;
    }

    // If the query's own cache key was modified (direct fetch), always propagate
    if (changes.modified.has(query.piiFieldKey)) {
      return true;
    }

    // Check if the query's object type is affected by the changes
    if (this.#shouldPropagateForPiiFieldTypeChanges(query.piiFieldKey, changes)) {
      return true;
    }

    // For other cross-propagation (e.g., RDP field updates from unrelated object types):
    // Only propagate to queries WITH RDP configurations
    const queryRdpConfig = this.#getQueryRdpConfig(query.piiFieldKey);

    // If query has no RDP, don't propagate unrelated object changes to it
    // (it will get updates from its own direct fetches only)
    return queryRdpConfig != null;
  }

  /**
   * Checks if changes to an object type should propagate to a query.
   * This ensures queries receive updates when objects of their type are added/modified.
   *
   * @param piiFieldKey - The cache key of the query
   * @param changes - The changes that occurred
   * @returns true if the query should be notified based on object type changes
   */
  #shouldPropagateForPiiFieldTypeChanges(
    piiFieldKey: KnownPiiFieldKey,
    changes: Changes,
  ): boolean {
    if (piiFieldKey.type === "pipelineSet" || piiFieldKey.type === "list") {
      const query = this.queries.peek(piiFieldKey);
      // Both ObjectSetQuery and ListQuery expose piiFieldTypes: ReadonlySet<string>
      if (query && "piiFieldTypes" in query) {
        for (
          const piiFieldType of (query as { piiFieldTypes: ReadonlySet<string> })
            .piiFieldTypes
        ) {
          if (this.#changesAffectPiiFieldType(changes, piiFieldType)) {
            return true;
          }
        }
      }
      return false;
    }

    const queryPiiFieldType = this.#getQueryPiiFieldType(piiFieldKey);
    if (!queryPiiFieldType) {
      return false;
    }

    const affected = this.#changesAffectPiiFieldType(changes, queryPiiFieldType);

    if (process.env.NODE_ENV !== "production") {
      this.logger?.child({ methodName: "shouldPropagateToQuery" }).debug(
        `Query type: ${queryPiiFieldType}, affected: ${affected}`,
        {
          queryKey: DEBUG_ONLY__piiFieldKeyToString(piiFieldKey),
          addedCount: (changes.addedObjects.get(queryPiiFieldType) as any)?.length ?? 0,
          modifiedCount: (changes.modifiedObjects.get(queryPiiFieldType) as any)?.length
            ?? 0,
        },
      );
    }

    return affected;
  }

  /**
   * Extracts RDP configuration from a cache key if present.
   *
   * @param piiFieldKey - The cache key to check
   * @returns The RDP configuration, null, or undefined
   */
  #getQueryRdpConfig(
    piiFieldKey: KnownPiiFieldKey,
  ): ScrubNormalized<Rdp> | null | undefined {
    if ("otherKeys" in piiFieldKey && Array.isArray(piiFieldKey.otherKeys)) {
      if (piiFieldKey.type === "object") {
        return piiFieldKey.otherKeys[OBJECT_RDP_CONFIG_IDX];
      } else if (piiFieldKey.type === "list") {
        return piiFieldKey.otherKeys[LIST_RDP_IDX];
      } else if (piiFieldKey.type === "aggregation") {
        return piiFieldKey.otherKeys[AGGREGATION_RDP_IDX];
      } else if (piiFieldKey.type === "pipelineSet") {
        const query = this.queries.peek(piiFieldKey);
        if (query) {
          return (query as any).rdpConfig;
        }
      } else if (piiFieldKey.type === "mediaMetadata") {
        return undefined;
      }
      // Links and other types would also be at LIST_RDP_IDX
    }
    return undefined;
  }

  /**
   * Extracts the object type (apiName) from a cache key.
   *
   * @param piiFieldKey - The cache key to check
   * @returns The object type/apiName, or undefined if not applicable
   */
  #getQueryPiiFieldType(piiFieldKey: KnownPiiFieldKey): string | undefined {
    if ("otherKeys" in piiFieldKey && Array.isArray(piiFieldKey.otherKeys)) {
      if (piiFieldKey.type === "object") {
        return piiFieldKey.otherKeys[OBJECT_API_NAME_IDX];
      } else if (piiFieldKey.type === "list") {
        return piiFieldKey.otherKeys[LIST_API_NAME_IDX];
      } else if (piiFieldKey.type === "aggregation") {
        return piiFieldKey.otherKeys[AGGREGATION_API_NAME_IDX];
      } else if (piiFieldKey.type === "mediaMetadata") {
        return piiFieldKey.otherKeys[0];
      }
      // Links would have apiName at a different position
    }
    return undefined;
  }

  /**
   * Checks if changes affect a specific object type.
   *
   * @param changes - The changes to check
   * @param piiFieldType - The object type to check for
   * @returns true if the changes include added or modified objects of this type
   */
  #changesAffectPiiFieldType(changes: Changes, piiFieldType: string): boolean {
    // Check added objects (MultiMap.get returns an array)
    const addedForType = changes.addedObjects.get(piiFieldType);
    if (addedForType && (addedForType as any).length > 0) {
      return true;
    }

    // Check modified objects (MultiMap.get returns an array)
    const modifiedForType = changes.modifiedObjects.get(piiFieldType);
    if (modifiedForType && (modifiedForType as any).length > 0) {
      return true;
    }

    for (const deletedKey of changes.deleted) {
      if (
        (deletedKey as any).type === "object"
        && (deletedKey as any).otherKeys[OBJECT_API_NAME_IDX] === piiFieldType
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Invalidates all cache entries for a specific object type.
   * This will revalidate:
   * 1. All objects of the specified type
   * 2. All lists of the specified type
   * 3. All links where the source object is of the specified type
   *
   * @param apiName - The API name of the object type to invalidate
   * @param changes - Optional changes object to track what has been modified
   * @returns Promise that resolves when all invalidations are complete
   */
  public invalidatePiiFieldType<T extends PiiFieldTypeDefinition>(
    apiName: T["apiName"] | T,
    changes: Changes | undefined,
  ): Promise<void> {
    if (typeof apiName !== "string") {
      apiName = apiName.apiName;
    }
    if (process.env.NODE_ENV !== "production") {
      this.logger?.child({ methodName: "invalidatePiiFieldType" }).info(
        changes ? DEBUG_ONLY__changesToString(changes) : void 0,
      );
    }

    const promises: Array<Promise<void>> = [];

    for (const piiFieldKey of this.layers.truth.keys()) {
      if (
        piiFieldKey.type !== "mediaMetadata"
        && changes
        && changes.modified.has(piiFieldKey)
      ) {
        continue;
      }
      const query = this.queries.peek(piiFieldKey);
      if (!query) continue;

      promises.push((query as any).invalidatePiiFieldType(apiName, changes));
    }

    // we use allSettled here because we don't care if it succeeds or fails, just that they all complete.
    return Promise.allSettled(promises).then(() => void 0);
  }

  public async invalidateAll(): Promise<void> {
    const promises: Array<Promise<unknown>> = [];
    for (const piiFieldKey of this.queries.keys()) {
      const query = this.queries.peek(piiFieldKey);
      if (query) {
        promises.push((query as any).revalidate(true));
      }
    }
    // we use allSettled here because we don't care if it succeeds or fails, just that they all complete.
    return Promise.allSettled(promises).then(() => void 0);
  }

  public async invalidateObjects(
    objects:
      | Coach.Instance<PiiFieldTypeDefinition>
      | ReadonlyArray<Coach.Instance<PiiFieldTypeDefinition>>,
  ): Promise<void> {
    const objectsArray = Array.isArray(objects) ? objects : [objects];
    const promises: Array<Promise<unknown>> = [];

    for (const obj of objectsArray) {
      promises.push(this.invalidateObject(obj.$piiFieldType, obj.$piiKey));
    }

    // we use allSettled here because we don't care if it succeeds or fails, just that they all complete.
    return Promise.allSettled(promises).then(() => void 0);
  }

  public async invalidateFunction(
    apiName: string | ScrubDefinition<unknown>,
    params?: Record<string, unknown>,
  ): Promise<void> {
    return this.functions.invalidateFunction(apiName, params);
  }

  public async invalidateFunctionsByObject(
    apiName: string,
    piiKey: string | number,
  ): Promise<void> {
    return this.functions.invalidateFunctionsByObject(apiName, piiKey);
  }

  #sizeCache: WeakMap<object, number> | undefined;

  public getCacheSnapshot(): CacheSnapshot {
    if (__DEV__) {
      const sizeCache = this.#sizeCache ??= new WeakMap<object, number>();
      const entries: CacheEntry[] = [];
      let totalSize = 0;

      for (const piiFieldKey of this.layers.truth.keys()) {
        const entry = this.layers.top.get(piiFieldKey);
        if (!entry) {
          continue;
        }

        let entryType: CacheEntry["type"] | undefined;
        let piiFieldType = "";

        if (piiFieldKey.type === "object") {
          entryType = "object";
          piiFieldType = piiFieldKey.otherKeys[OBJECT_API_NAME_IDX];
        } else if (piiFieldKey.type === "list") {
          entryType = "list";
          piiFieldType = piiFieldKey.otherKeys[LIST_API_NAME_IDX];
        } else if (piiFieldKey.type === "specificLink") {
          entryType = "link";
          piiFieldType = piiFieldKey.otherKeys[LINK_API_NAME_IDX];
        } else if (piiFieldKey.type === "pipelineSet") {
          entryType = "pipelineSet";
          piiFieldType = "";
        }

        if (!entryType) {
          continue;
        }

        let estimatedSize = 0;
        if (entry.value != null && typeof entry.value === "object") {
          const objectValue = entry.value;
          const cached = sizeCache.get(objectValue);
          if (cached !== undefined) {
            estimatedSize = cached;
          } else {
            try {
              estimatedSize = JSON.stringify(entry.value).length * 2;
            } catch {
              // TODO: surface unserializable entries to devtools users
              estimatedSize = 0;
            }
            sizeCache.set(objectValue, estimatedSize);
          }
        } else if (entry.value != null) {
          try {
            estimatedSize = JSON.stringify(entry.value).length * 2;
          } catch {
            estimatedSize = 0;
          }
        }
        totalSize += estimatedSize;

        entries.push({
          key: DEBUG_ONLY__piiFieldKeyToString(piiFieldKey),
          type: entryType,
          piiFieldType,
          metadata: {
            timestamp: entry.lastUpdated,
            status: entry.status,
            size: estimatedSize,
          },
          data: entry.value,
        });
      }

      return {
        entries,
        stats: {
          totalEntries: entries.length,
          totalSize,
        },
      };
    }

    return {
      entries: [],
      stats: { totalEntries: 0, totalSize: 0 },
    };
  }
}
