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

import type {
  InterfaceDefinition,
  ObjectOrInterfaceDefinition,
  PipelineSet,
  PiiFieldTypeDefinition,
  PrivacyConfig,
  PageResult,
  PiiKeyType,
  WhereClause,
} from "../../../coach-types";
import deepEqual from "fast-deep-equal";
import { type Subject } from "rxjs";
import { additionalContext } from "../../../coach-engine";
import type { SpecificLinkPayload } from "../../LinkPayload";
import type { Status } from "../../PrivacyScrubClient/common";
import type { ObserveLinks } from "../../PrivacyScrubClient/ObserveLink";
import type { CollectionConnectableParams } from "../base-scrubField/BaseCollectionQuery";
import { BaseScrubFieldQuery } from "../base-scrubField/BaseScrubFieldQuery";
import type { BatchContext } from "../BatchContext";
import type { PiiFieldKey } from "../PiiFieldKey";
import type { ScrubNormalized } from "../ScrubNormalized";
import type { Changes } from "../Changes";
import type { Entry } from "../Layer";
import type { DeferredId } from "../DeferredId";
import type { Rdp } from "../RdpScrubNormalizer";
import type { SimpleWhereClause } from "../SimpleWhereClause";
import { OrderBySortingStrategy } from "../sorting/SortingStrategy";
import type { Store } from "../Store";
import type { SubjectPayload } from "../SubjectPayload";
import { piiTombstone } from "../piiTombstone";
import {
  INCLUDE_ALL_BASE_PROPERTIES_IDX as LINK_INCLUDE_ALL_BASE_PROPERTIES_IDX,
  SELECT_IDX as LINK_SELECT_IDX,
  type SpecificLinkPiiFieldKey,
} from "./SpecificLinkPiiFieldKey";

/**
 * Query implementation for retrieving linked objects from a specific object.
 * - Stores links as ObjectPiiFieldKey[] references
 * - Creates indirect dependencies on linked objects
 * - Supports filtering and sorting of linked collections
 * - Handles proper invalidation of related objects
 */
export class SpecificLinkQuery extends BaseScrubFieldQuery<
  SpecificLinkPiiFieldKey,
  SpecificLinkPayload,
  ObserveLinks.Options<ObjectOrInterfaceDefinition, string>
> {
  #sourceApiName: string;
  #sourceTypeKind: "object" | "interface";
  #sourceUnderlyingPiiFieldType: string;
  #sourcePk: PiiKeyType<PiiFieldTypeDefinition>;
  #linkName: string;
  #whereClause: ScrubNormalized<SimpleWhereClause>;
  #orderBy: ScrubNormalized<Record<string, "asc" | "desc" | undefined>>;
  #select: ScrubNormalized<readonly string[]> | undefined;

  protected override createPayload(
    params: CollectionConnectableParams,
  ): SpecificLinkPayload {
    return {
      (...super as any).createPayload(params),
      linkedObjectsBySourcePrimaryKey: new Map([[
        this.#sourcePk,
        params.resolvedData ?? [],
      ]]),
    };
  }

  /**
   * Register changes to the cache specific to SpecificLinkQuery
   */
  protected registerCacheChanges(batch: BatchContext): void {
    batch.changes.modified.add(this.piiFieldKey);
  }

  constructor(
    store: Store,
    subject: Subject<SubjectPayload<SpecificLinkPiiFieldKey>>,
    piiFieldKey: SpecificLinkPiiFieldKey,
    opts: ObserveLinks.Options<ObjectOrInterfaceDefinition, string>,
  ) {
    super(
      store,
      subject,
      opts,
      piiFieldKey,
      process.env.NODE_ENV !== "production"
        ? (
          store.client[additionalContext].logger?.child({}, {
            msgPrefix: `SpecificLinkQuery<${
              piiFieldKey.otherKeys.map(x => JSON.stringify(x)).join(", ")
            }>`,
          })
        )
        : undefined,
    );

    // Extract the necessary parameters from the cache key
    [
      this.#sourceApiName,
      this.#sourceTypeKind,
      this.#sourceUnderlyingPiiFieldType,
      this.#sourcePk,
      this.#linkName,
      this.#whereClause,
      this.#orderBy,
    ] = piiFieldKey.otherKeys;
    this.#select = piiFieldKey.otherKeys[LINK_SELECT_IDX];
  }

  protected get rawSelect(): ScrubNormalized<readonly string[]> | undefined {
    return this.#select;
  }

  // TODO: wire up RDP support for SpecificLinkPiiFieldKey (needs its own slot).
  public override get rdpConfig(): ScrubNormalized<Rdp> | undefined {
    return undefined;
  }

  public override get includeAllBaseObjectProperties(): boolean {
    return (
      this.piiFieldKey.otherKeys[LINK_INCLUDE_ALL_BASE_PROPERTIES_IDX] === true
    );
  }

  /**
   * Implements fetchPageData from the BaseCollectionQuery template method pattern
   */
  protected async fetchPageData(
    signal: AbortSignal | undefined,
  ): Promise<PageResult<Coach.Instance<any>>> {
    const client = this.store.client;
    const gameStateProvider = client[additionalContext].gameStateProvider;
    const isInterface = this.#sourceTypeKind === "interface";

    // Resolve the link target's apiName + kind once if needed for sorting or
    // for gating the $includeAllBaseObjectProperties param. The gameState
    // provider caches its lookups, so calling it here is cheap.
    const hasOrderBy = this.#orderBy
      && Object.keys(this.#orderBy).length > 0;
    let target: { apiName: string; kind: "object" | "interface" } | undefined;
    if (hasOrderBy || this.includeAllBaseObjectProperties) {
      if (isInterface) {
        const interfaceMetadata = await gameStateProvider.getInterfaceDefinition(
          this.#sourceApiName,
        );
        const linkDef = interfaceMetadata.links?.[this.#linkName];
        if (!linkDef) {
          throw new Error(
            `Missing link definition for link '${this.#linkName}' on interface '${this.#sourceApiName}'`,
          );
        }
        target = {
          apiName: linkDef.targetTypeApiName,
          kind: linkDef.targetType,
        };
      } else {
        const objectMetadata = await gameStateProvider.getObjectDefinition(
          this.#sourceApiName,
        );
        const linkDef = objectMetadata.links?.[this.#linkName];
        if (!linkDef?.targetType) {
          throw new Error(
            `Missing link definition or targetType for link '${this.#linkName}' on object type '${this.#sourceApiName}'`,
          );
        }
        // Object link defs always target an object type.
        target = { apiName: linkDef.targetType, kind: "object" };
      }
    }

    if (target && hasOrderBy) {
      this.sortingStrategy = new OrderBySortingStrategy(
        target.apiName,
        this.#orderBy,
      );
    }

    let linkQuery: PipelineSet<ObjectOrInterfaceDefinition>;

    if (isInterface) {
      const objectMetadata = await gameStateProvider.getObjectDefinition(
        this.#sourceUnderlyingPiiFieldType,
      );

      const interfaceSet = client({
        type: "interface",
        apiName: this.#sourceApiName,
      } as InterfaceDefinition) as PipelineSet<ObjectOrInterfaceDefinition>;

      const objectFilteredByPk = client({
        type: "object",
        apiName: this.#sourceUnderlyingPiiFieldType,
      } as PiiFieldTypeDefinition).where({
        [objectMetadata.piiKeyApiName]: this.#sourcePk,
      } as WhereClause<any>);

      const filteredSource = interfaceSet.intersect(objectFilteredByPk);

      linkQuery = filteredSource.pivotTo(this.#linkName);
    } else {
      const objectMetadata = await gameStateProvider.getObjectDefinition(
        this.#sourceApiName,
      );

      const sourceSet = client({
        type: "object",
        apiName: this.#sourceApiName,
      } as PiiFieldTypeDefinition);

      const sourceQuery = sourceSet.where({
        [objectMetadata.piiKeyApiName]: this.#sourcePk,
      } as WhereClause<any>);

      linkQuery = sourceQuery.pivotTo(this.#linkName);
    }

    if (signal?.aborted) {
      throw new Error("Aborted");
    }

    const queryParams: {
      $pageSize: number;
      $nextPageToken: string | undefined;
      $includeRid: true;
      $orderBy?: Record<string, "asc" | "desc" | undefined>;
      $where?: Record<string, unknown>;
      $select?: readonly string[];
      $includeAllBaseObjectProperties?: true;
    } = {
      $pageSize: this.getEffectiveFetchPageSize(),
      $nextPageToken: this.nextPageToken,
      $includeRid: true,
    };

    if (this.#select && this.#select.length > 0) {
      queryParams.$select = this.#select;
    }

    if (this.#orderBy && Object.keys(this.#orderBy).length > 0) {
      queryParams.$orderBy = this.#orderBy;
    }

    if (this.#whereClause && Object.keys(this.#whereClause).length > 0) {
      queryParams.$where = this.#whereClause;
    }

    // Only forward $includeAllBaseObjectProperties when the link target is an
    // interface — for object targets the flag is a no-op on the server.
    if (target?.kind === "interface") {
      queryParams.$includeAllBaseObjectProperties = true;
    }

    const response = await linkQuery.fetchPage(queryParams);

    // Store the next page token for pagination
    this.nextPageToken = response.nextPageToken;

    return response;
  }

  /**
   * Removes a link query from the store
   */
  deleteFromStore(
    status: Status,
    batch: BatchContext,
  ): Entry<SpecificLinkPiiFieldKey> | undefined {
    const entry = batch.read(this.piiFieldKey);

    if (entry && deepEqual(piiTombstone, entry.value)) {
      if (process.env.NODE_ENV !== "production") {
        this.logger?.child({ methodName: "deleteFromStore" }).debug(
          `Links were already deleted, just setting status`,
        );
      }
      return batch.write(this.piiFieldKey, entry.value, status);
    }

    if (process.env.NODE_ENV !== "production") {
      this.logger?.child({ methodName: "deleteFromStore" }).debug(
        JSON.stringify({ status }),
      );
    }

    // If there is no entry then there is nothing to do
    if (!entry || !entry.value) {
      return;
    }

    const ret = batch.delete(this.piiFieldKey, status);
    batch.changes.deleted.add(this.piiFieldKey);

    return ret;
  }

  /**
   * Implements Query.maybeUpdateAndRevalidate to handle cache invalidation
   */
  maybeUpdateAndRevalidate = async (
    changes: Changes,
    _deferredId: DeferredId | undefined,
  ): Promise<void> => {
    if (changes.modified.has(this.piiFieldKey)) {
      return this.revalidate(true);
    }

    return Promise.resolve();
  };

  invalidatePiiFieldType = (
    piiFieldType: string,
    changes: Changes | undefined,
  ): Promise<void> => {
    // We need to invalidate links in multiple cases:
    // 1. When the source object type matches the apiName (direct invalidation)
    // 2. When the source is an interface and the invalidated type implements it
    // 3. When the target type matches the invalidated type
    // 4. When the target is an interface and the invalidated type implements it

    if (
      this.#sourceTypeKind === "object" && this.#sourceApiName === piiFieldType
    ) {
      changes?.modified.add(this.piiFieldKey);
      return this.revalidate(true);
    }

    return (async () => {
      try {
        const gameStateProvider = this.store.client[additionalContext]
          .gameStateProvider;

        if (this.#sourceTypeKind === "interface") {
          const objectMetadata = await gameStateProvider.getObjectDefinition(
            piiFieldType,
          );
          if (this.#sourceApiName in objectMetadata.interfaceMap) {
            changes?.modified.add(this.piiFieldKey);
            return void await this.revalidate(true);
          }
        }

        let targetTypeApiName: string | undefined;

        if (this.#sourceTypeKind === "interface") {
          const interfaceMetadata = await gameStateProvider
            .getInterfaceDefinition(this.#sourceApiName);
          targetTypeApiName = interfaceMetadata.links?.[this.#linkName]
            ?.targetTypeApiName;
        } else {
          const objectMetadata = await gameStateProvider
            .getObjectDefinition(this.#sourceApiName);
          // Object link def's `targetType` is the target API name; it can be
          // either an object type or an interface name.
          targetTypeApiName = objectMetadata.links?.[this.#linkName]
            ?.targetType;
        }

        if (!targetTypeApiName) return;

        if (targetTypeApiName === piiFieldType) {
          changes?.modified.add(this.piiFieldKey);
          return void await this.revalidate(true);
        }

        // If the target is an interface, revalidate when piiFieldType implements
        // it. For object-typed targets, interfaceMap[piiFieldTypeName] is always
        // false, so this is a safe no-op.
        const objectMetadata = await gameStateProvider.getObjectDefinition(
          piiFieldType,
        );
        if (targetTypeApiName in objectMetadata.interfaceMap) {
          changes?.modified.add(this.piiFieldKey);
          return void await this.revalidate(true);
        }
      } catch (e) {
        if (process.env.NODE_ENV !== "production") {
          this.logger?.error(
            "Failed to resolve metadata during invalidation",
            e,
          );
        }
        changes?.modified.add(this.piiFieldKey);
        return void await this.revalidate(true);
      }
    })();
  };
}

/**
 * Type guard to check if a cache key is a SpecificLinkPiiFieldKey
 */
export function isSpecificLinkPiiFieldKey(
  key: PiiFieldKey,
): key is SpecificLinkPiiFieldKey {
  return key.type === "specificLink";
}
