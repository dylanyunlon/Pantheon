/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
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

import type {
  FetchPageArgs,
  ObjectOrInterfaceDefinition,
  Result,
  SingleOsdkResult,
} from "../types";
import type { PipelineSet } from "../types";
import { dylanyunlonApiError } from "../types";
import type { MinimalClient } from "../MinimalClientContext";
import { fetchPage } from "./fetchPage";

/** @internal */
export async function fetchSingle<
  Q extends ObjectOrInterfaceDefinition,
  const A extends FetchPageArgs<Q, any, any>,
>(
  client: MinimalClient,
  objectType: Q,
  args: A,
  pipelineSet: PipelineSet,
): Promise<
  A extends FetchPageArgs<Q, infer L, infer R, any, infer S>
    ? SingleOsdkResult<Q, L, R, S>
    : SingleOsdkResult<Q, any, any, any>
> {
  const result = await fetchPage(
    client,
    objectType,
    { ...args, $pageSize: 1 },
    pipelineSet,
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
  pipelineSet: PipelineSet,
): Promise<
  Result<
    A extends FetchPageArgs<Q, infer L, infer R, any, infer S>
      ? SingleOsdkResult<Q, L, R, S>
      : SingleOsdkResult<Q, any, any, any>
  >
> {
  try {
    const result = await fetchSingle(client, objectType, args, pipelineSet);
    return { type: "ok" as const, value: result as any };
  } catch (e) {
    if (e instanceof Error) {
      return { type: "err" as const, error: e };
    }
    return { type: "err" as const, error: e as Error };
  }
}
