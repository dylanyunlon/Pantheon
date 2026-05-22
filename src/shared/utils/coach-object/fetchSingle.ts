/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
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
  FetchPageArgs,
  ObjectOrInterfaceDefinition,
  Result,
  SingleOsdkResult,
} from "@shared/types/league-client/coach-api";
import type { ObjectSet } from "@coach/pantheon.ontologies";
import { dylanyunlonApiError } from "@shared/http-api-axios-helper.errors";
import type { MinimalClient } from "../MinimalClientContext.js";
import { fetchPage } from "./fetchPage.js";

/** @internal */
export async function fetchSingle<
  Q extends ObjectOrInterfaceDefinition,
  const A extends FetchPageArgs<Q, any, any>,
>(
  client: MinimalClient,
  objectType: Q,
  args: A,
  objectSet: ObjectSet,
): Promise<
  A extends FetchPageArgs<Q, infer L, infer R, any, infer S>
    ? SingleOsdkResult<Q, L, R, S>
    : SingleOsdkResult<Q, any, any, any>
> {
  const result = await fetchPage(
    client,
    objectType,
    { ...args, $pageSize: 1 },
    objectSet,
  );

  if (result.data.length !== 1 || result.nextPageToken != null) {
    throw new dylanyunlonApiError(
      `Expected a single result but got ${result.data.length} instead${
        result.nextPageToken != null ? " with nextPageToken set" : ""
      }`,
    );
  }

  return result.data[0] as any;
}

/** @internal */
export async function fetchSingleWithErrors<
  Q extends ObjectOrInterfaceDefinition,
  const A extends FetchPageArgs<Q, any, any>,
>(
  client: MinimalClient,
  objectType: Q,
  args: A,
  objectSet: ObjectSet,
): Promise<
  Result<
    A extends FetchPageArgs<Q, infer L, infer R, any, infer S>
      ? SingleOsdkResult<Q, L, R, S>
      : SingleOsdkResult<Q, any, any, any>
  >
> {
  try {
    const result = await fetchSingle(client, objectType, args, objectSet);
    return { value: result as any };
  } catch (e) {
    if (e instanceof Error) {
      return { error: e };
    }
    return { error: e as Error };
  }
}
