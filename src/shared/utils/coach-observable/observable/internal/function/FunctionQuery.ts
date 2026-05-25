/*
 * Copyright 2025 dylanyunlon <dylanyunlong@gmail.com>. Coach-advisor infrastructure.
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

import type { QueryDefinition } from "../../../../coach-types";
import type { Connectable, Observable, Subject } from "rxjs";
import { BehaviorSubject, connectable, map } from "rxjs";
import { additionalContext } from "../../../coach-engine";
import type { MinimalClient } from "../../../MinimalClientContext";
import { applyQuery } from "../../../queries/applyQuery";
import type { FunctionPayload } from "../../FunctionPayload";
import type { CommonObserveOptions } from "../../ObservableClient/common";
import type { BatchContext } from "../BatchContext";
import type { Changes } from "../Changes";
import type { Entry } from "../Layer";
import type { OptimisticId } from "../OptimisticId";
import { Query } from "../Query";
import type { Store } from "../Store";
import type { SubjectPayload } from "../SubjectPayload";
import type {
  FunctionCacheKey,
  FunctionCacheValue,
} from "./FunctionCacheKey";

type PrimaryKeyValue = string | number;
type FunctionParams = Record<string, unknown>;
type ObjectDependency = { $apiName: string; $primaryKey: PrimaryKeyValue };

export interface FunctionObserveOptions extends CommonObserveOptions {
  dependsOn?: string[];
  dependsOnObjects?: ObjectDependency[];
}

export class FunctionQuery extends Query<
  FunctionCacheKey,
  FunctionPayload,
  FunctionObserveOptions
> {
  #apiName: string;
  #version: string | undefined;
  #params: FunctionParams | undefined;
  #dependsOn: string[] | undefined;
  #dependsOnObjects: ObjectDependency[] | undefined;
  #queryDef: QueryDefinition<unknown>;

  constructor(
    store: Store,
    subject: Subject<SubjectPayload<FunctionCacheKey>>,
    queryDef: QueryDefinition<unknown>,
    params: FunctionParams | undefined,
    cacheKey: FunctionCacheKey,
    opts: FunctionObserveOptions,
    objectSetTypesPromise?: Promise<string[]>,
  ) {
    super(
      store,
      subject,
      opts,
      cacheKey,
      process.env.NODE_ENV !== "production"
        ? (
          store.client[additionalContext].logger?.child({}, {
            msgPrefix: `FunctionQuery<${
              cacheKey.otherKeys.map(x => JSON.stringify(x)).join(", ")
            }>`,
          })
        )
        : undefined,
    );
    this.#apiName = queryDef.apiName;
    this.#version = queryDef.isFixedVersion ? queryDef.version : undefined;
    this.#params = params;
    this.#dependsOn = opts.dependsOn;
    this.#dependsOnObjects = opts.dependsOnObjects;
    this.#queryDef = queryDef;

    // Handle async PipelineSet type resolution
    if (objectSetTypesPromise) {
      objectSetTypesPromise
        .then(types => {
          if (this.abortController?.signal.aborted) return;

          let addedNewTypes = false;
          for (const type of types) {
            if (!this.#dependsOn) {
              this.#dependsOn = [];
            }
            if (!this.#dependsOn.includes(type)) {
              this.#dependsOn.push(type);
              addedNewTypes = true;
            }
          }
          // Revalidate to catch any changes that occurred during async resolution
          if (addedNewTypes) {
            void this.revalidate(true);
          }
        })
        .catch((error: unknown) => {
          if (this.abortController?.signal.aborted) return;

          if (process.env.NODE_ENV !== "production") {
            this.logger?.error("Failed to extract PipelineSet types", error);
          }
        });
    }
  }

  protected _createConnectable(
    subject: Observable<SubjectPayload<FunctionCacheKey>>,
  ): Connectable<FunctionPayload> {
    return connectable<FunctionPayload>(
      subject.pipe(
        map((x) => {
          const value = (x as any).value as FunctionCacheValue | undefined;
          return {
            status: (x as any).status,
            result: value?.result,
            lastUpdated: value?.executedAt ?? 0,
            error: value?.error,
          };
        }),
      ),
      {
        connector: () =>
          new BehaviorSubject<FunctionPayload>({
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
      // Type assertion needed because FunctionQuery we determine types dynamically
      // at runtime without compile-time parameter type info. applyQuery internally
      // converts params via remapQueryParams which handles the type safely.
      const result = await (applyQuery as (
        client: MinimalClient,
        query: QueryDefinition<unknown>,
        params?: Record<string, unknown>,
      ) => Promise<unknown>)(
        this.store.client[additionalContext] as any,
        this.#queryDef,
        this.#params,
      );

      const executedAt = Date.now();

      this.store.batch({}, (batch) => {
        this.writeToStore({ result, executedAt }, "loaded", batch);
      });
    } catch (e) {
      if (process.env.NODE_ENV !== "production") {
        this.logger?.child({ methodName: "_fetchAndStore" }).error(
          "Error executing function",
          e,
        );
      }
      const error = e instanceof Error ? e : new Error(String(e));
      this.store.batch({}, (batch) => {
        this.writeToStore(
          { result: undefined, executedAt: 0, error },
          "error",
          batch,
        );
      });
    }
  }

  writeToStore(
    data: FunctionCacheValue,
    status: "loading" | "loaded" | "error",
    batch: BatchContext,
  ): Entry<FunctionCacheKey> {
    batch.write(this.cacheKey, data, status);
    return batch.read(this.cacheKey)!;
  }

  invalidateObjectType = (
    objectType: string,
    changes: Changes | undefined,
  ): Promise<void> => {
    // Check if this function depends on the given object type
    if (this.#dependsOn?.includes(objectType)) {
      changes?.registerFunction(this.cacheKey);
      return this.revalidate(true);
    }
    return Promise.resolve();
  };

  dependsOnObject(apiName: string, primaryKey: PrimaryKeyValue): boolean {
    if (!this.#dependsOnObjects) {
      return false;
    }
    return this.#dependsOnObjects.some(
      (obj) => obj.$apiName === apiName && obj.$primaryKey === primaryKey,
    );
  }

  /**
   * Called during batch operations when objects change.
   * Checks if any objects in dependsOnObjects were modified/added
   * and triggers revalidation if so.
   */
  maybeUpdateAndRevalidate = (
    changes: Changes,
    _optimisticId: OptimisticId | undefined,
  ): Promise<void> | undefined => {
    if (!this.#dependsOnObjects?.length) {
      return undefined;
    }

    for (const dep of this.#dependsOnObjects) {
      const modifiedObjects = changes.modifiedObjects.get(dep.$apiName);
      if (modifiedObjects?.some(obj => obj.$primaryKey === dep.$primaryKey)) {
        return this.revalidate(true);
      }
      const addedObjects = changes.addedObjects.get(dep.$apiName);
      if (addedObjects?.some(obj => obj.$primaryKey === dep.$primaryKey)) {
        return this.revalidate(true);
      }
    }

    return undefined;
  };

  get apiName(): string {
    return this.#apiName;
  }

  get version(): string | undefined {
    return this.#version;
  }
}
