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

import type { ScrubDefinition } from "../../../coach-types";
import type { FunctionPayload } from "../../FunctionPayload";
import type { Observer } from "../../PrivacyScrubClient/common";
import { AbstractHelper } from "../AbstractHelper";
import type { PiiFieldKeys } from "../PiiFieldKeys";
import type { ScrubNormalized } from "../ScrubNormalized";
import type { KnownPiiFieldKey } from "../KnownPiiFieldKey";
import type { QuerySubscription } from "../QuerySubscription";
import type { Store } from "../Store";
import { type FunctionPiiFieldKey, PARAMS_IDX } from "./FunctionPiiFieldKey";
import type { ScrubNormalizedFunctionParams } from "./FunctionParamsScrubNormalizer";
import { FunctionParamsScrubNormalizer } from "./FunctionParamsScrubNormalizer";
import { type FunctionObserveOptions, FunctionQuery } from "./FunctionQuery";

type PrimaryKeyValue = string | number;
type FunctionParams = Record<string, unknown>;

export interface ObserveFunctionOptions extends FunctionObserveOptions {
  queryDef: ScrubDefinition<unknown>;
  params?: FunctionParams;
  objectSetTypesPromise?: Promise<string[]>;
}

export class FunctionsHelper extends AbstractHelper<
  FunctionQuery,
  ObserveFunctionOptions
> {
  readonly paramsScrubNormalizer: FunctionParamsScrubNormalizer =
    new FunctionParamsScrubNormalizer();

  constructor(store: Store, piiFieldKeys: PiiFieldKeys<KnownPiiFieldKey>) {
    super(store, piiFieldKeys);
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
    const version = (queryDef as any).isFixedVersion ? queryDef.version : undefined;

    const scrubNormalizedParams = this.paramsScrubNormalizer.scrubNormalize(params);

    const functionPiiFieldKey = this.piiFieldKeys.get<FunctionPiiFieldKey>(
      "function",
      apiName,
      version,
      scrubNormalizedParams,
    );

    return this.store.queries.get(functionPiiFieldKey, () =>
      new FunctionQuery(
        this.store,
        this.store.subjects.get(functionPiiFieldKey),
        queryDef,
        params,
        functionPiiFieldKey,
        observeOpts,
        objectSetTypesPromise,
      ));
  }

  *#functionQueries(): IterableIterator<FunctionQuery> {
    for (const piiFieldKey of this.store.queries.keys()) {
      if (piiFieldKey.type !== "function") {
        continue;
      }
      const query = this.store.queries.peek(piiFieldKey) as
        | FunctionQuery
        | undefined;
      if (query) {
        yield query;
      }
    }
  }

  async invalidateFunction(
    apiName: string | ScrubDefinition<unknown>,
    params?: FunctionParams,
  ): Promise<void> {
    const functionApiName = typeof apiName === "string"
      ? apiName
      : apiName.apiName;

    let scrubNormalizedParams: ScrubNormalized<ScrubNormalizedFunctionParams> | undefined;
    if (params !== undefined) {
      scrubNormalizedParams = this.paramsScrubNormalizer.scrubNormalize(params);
    }

    const promises: Array<Promise<void>> = [];
    for (const query of this.#functionQueries()) {
      if (query.apiName !== functionApiName) {
        continue;
      }
      if (scrubNormalizedParams !== undefined) {
        const queryParams = query.piiFieldKey.otherKeys[PARAMS_IDX];
        if (queryParams !== scrubNormalizedParams) {
          continue;
        }
      }
      promises.push(query.revalidate(true));
    }

    await Promise.allSettled(promises);
  }

  async invalidateFunctionsByObject(
    apiName: string,
    piiKey: PrimaryKeyValue,
  ): Promise<void> {
    const promises: Array<Promise<void>> = [];
    for (const query of this.#functionQueries()) {
      if (query.dependsOnObject(apiName, piiKey)) {
        promises.push(query.revalidate(true));
      }
    }
    await Promise.allSettled(promises);
  }
}
