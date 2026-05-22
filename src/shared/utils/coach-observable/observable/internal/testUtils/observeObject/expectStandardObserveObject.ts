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

import type { ObjectTypeDefinition, PrimaryKeyType } from "@shared/types/league-client/coach-api";
import { expect } from "vitest";
import type { TypedObjectPayload } from "../../../ObjectPayload.js";
import type { Store } from "../../Store.js";
import type { MockedSingleSubCallback } from "../../testUtils.js";
import {
  createDefer,
  expectSingleObjectCallAndClear,
  mockSingleSubCallback,
  waitForCall,
} from "../../testUtils.js";

const defer = createDefer();

/**
 * Utility function for testing object observation behavior
 *
 * This function provides the following guarantees:
 * - Validates the initial "loading" state is emitted
 * - Waits for the subscription callback to be called again
 * - Validates the "loaded" state with the expected object containing apiName and primaryKey
 * - Returns both the observed object and mock subscription function for further assertions
 *
 * @param cache - The Store instance to use for observation
 * @param apiName - The API name for the object to observe
 * @param primaryKey - The primary key of the object to observe
 * @returns A promise that resolves to the observed object and the mocked subscription callback
 */
export async function expectStandardObserveObject<
  T extends ObjectTypeDefinition,
>(
  { cache, type, primaryKey }: {
    cache: Store;
    type: T;
    primaryKey: PrimaryKeyType<T>;
  },
): Promise<{
  payload: TypedObjectPayload<T>;
  subFn: MockedSingleSubCallback;
}> {
  const subFn = mockSingleSubCallback();
  defer(
    cache.objects.observe({
      apiName: type,
      pk: primaryKey,
    }, subFn),
  );

  expectSingleObjectCallAndClear(
    subFn,
    undefined,
    "loading",
  );

  await waitForCall(subFn);

  const obj = expectSingleObjectCallAndClear(
    subFn,
    expect.objectContaining({
      $apiName: type.apiName,
      $primaryKey: primaryKey,
    }),
    "loaded",
  );
  return { payload: obj as TypedObjectPayload<T>, subFn };
}
