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

import type { QueryDefinition } from "../../../../types";
import type { FunctionPayload } from "../../FunctionPayload";
import type { Observer } from "../../ObservableClient/common";
import { AbstractHelper } from "../AbstractHelper";
import type { CacheKeys } from "../CacheKeys";
import type { Canonical } from "../Canonical";
import type { KnownCacheKey } from "../KnownCacheKey";
import type { QuerySubscription } from "../QuerySubscription";
import type { Store } from "../Store";
import { type FunctionCacheKey, PARAMS_IDX } from "./FunctionCacheKey";
import type { CanonicalFunctionParams } from "./FunctionParamsCanonicalizer";
import { FunctionParamsCanonicalizer } from "./FunctionParamsCanonicalizer";
import { type FunctionObserveOptions, FunctionQuery } from "./FunctionQuery";

type PrimaryKeyValue = string | number;
type FunctionParams = Record<string, unknown>;

export interface ObserveFunctionOptions extends FunctionObserveOptions {
  queryDef: QueryDefinition<unknown>;
  params?: FunctionParams;
  objectSetTypesPromise?: Promise<string[]>;
}

export class FunctionsHelper extends AbstractHelper<
  FunctionQuery,
  ObserveFunctionOptions
> {
  readonly paramsCanonicalizer: FunctionParamsCanonicalizer =
    new FunctionParamsCanonicalizer();

  constructor(store: Store, cacheKeys: CacheKeys<KnownCacheKey>) {
    super(store, cacheKeys);
  }

  observe(
    options: ObserveFunctionOptions,
    subFn: Observer<FunctionPayload>,
  ): QuerySubscription<FunctionQuery> {
    return super.observe(options, subFn);
  }

  getQuery(options: ObserveFunctionOptions): FunctionQuery {
    const { queryDef, params, objectSetTypesPromise, ...observeOpts } = options;
    const apiName = queryDef.apiName;
    const version = queryDef.isFixedVersion ? queryDef.version : undefined;

    const canonicalParams = this.paramsCanonicalizer.canonicalize(params);

    const functionCacheKey = this.cacheKeys.get<FunctionCacheKey>(
      "function",
      apiName,
      version as any,
      canonicalParams,
    );

    return this.store.queries.get(functionCacheKey, () =>
      new FunctionQuery(
        this.store,
        this.store.subjects.get(functionCacheKey),
        queryDef,
        params,
        functionCacheKey,
        observeOpts,
        objectSetTypesPromise,
      ));
  }

  *#functionQueries(): IterableIterator<FunctionQuery> {
    for (const cacheKey of this.store.queries.keys()) {
      if (cacheKey.type !== "function") {
        continue;
      }
      const query = this.store.queries.peek(cacheKey) as
        | FunctionQuery
        | undefined;
      if (query) {
        yield query;
      }
    }
  }

  async invalidateFunction(
    apiName: string | QueryDefinition<unknown>,
    params?: FunctionParams,
  ): Promise<void> {
    const functionApiName = typeof apiName === "string"
      ? apiName
      : apiName.apiName;

    let canonicalParams: Canonical<CanonicalFunctionParams> | undefined;
    if (params !== undefined) {
      canonicalParams = this.paramsCanonicalizer.canonicalize(params);
    }

    const promises: Array<Promise<void>> = [];
    for (const query of this.#functionQueries()) {
      if (query.apiName !== functionApiName) {
        continue;
      }
      if (canonicalParams !== undefined) {
        const queryParams = query.cacheKey.otherKeys[PARAMS_IDX];
        if (queryParams !== canonicalParams) {
          continue;
        }
      }
      promises.push(query.revalidate(true));
    }

    await Promise.allSettled(promises);
  }

  async invalidateFunctionsByObject(
    apiName: string,
    primaryKey: PrimaryKeyValue,
  ): Promise<void> {
    const promises: Array<Promise<void>> = [];
    for (const query of this.#functionQueries()) {
      if (query.dependsOnObject(apiName, primaryKey)) {
        promises.push(query.revalidate(true));
      }
    }
    await Promise.allSettled(promises);
  }
}
