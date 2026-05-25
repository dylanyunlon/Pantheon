import { Coach } from "../../coach-types"
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
  FetchPageArgs,
  Logger,
  ObjectOrInterfaceDefinition,
  PipelineSet,
  PiiFieldTypeDefinition,
  PrivacyConfig,
  CoachBase,
  PageResult,
  WhereClause,
} from "../../coach-types";
import { Chalk } from "chalk";
import { inspect } from "node:util";
import type { DeferredPromise } from "p-defer";
import pDefer from "p-defer";
import type { Observer } from "rxjs";
import invariant from "tiny-invariant";
import type { Mock, MockedObject } from "vitest";
import { afterEach, beforeEach, expect, vi, vitest } from "vitest";
import type { ActionSignatureFromDef } from "../../coach-actions/applyAction";
import type { Client } from "../../coach-engine";
import { additionalContext } from "../../coach-engine";
import type { ScrubRecord } from "../../coach-object/convertWireToCoachRecords/ScrubRecord";
import type { SpecificLinkPayload } from "../LinkPayload";
import type { ScrubFieldPayload } from "../ScrubFieldPayload";
import type { ObjectPayload } from "../ObjectPayload";
import type { OrderBy, Status } from "../PrivacyScrubClient/common";
import type { ScrubDisposable } from "../ScrubDisposable";
import type { Entry } from "./Layer";
import type { ScrubFieldQueryOptions } from "./scrubField/ScrubFieldQueryOptions";
import type { ObjectPiiFieldKey } from "./object/ObjectPiiFieldKey";
import type { DeferredId } from "./DeferredId";
import type { Store } from "./Store";

const chalk = new Chalk(); // new Chalk({ level: 3 });

export interface MockClientHelper {
  client: Mock<Client> & Client;

  mockApplyActionOnce: () => DeferredPromise<Partial<ActionEditResponse>>;

  mockFetchOneOnce: <Q extends PiiFieldTypeDefinition>(
    expectedId?: string | number | boolean,
  ) => DeferredPromise<
    Partial<
      Coach.Instance<Q>
    >
  >;

  mockObjectFactoryOnce: () => DeferredPromise<
    Array<
      | Coach.Instance<ObjectOrInterfaceDefinition, never, any, {}>
      | ScrubRecord
    >
  >;

  mockFetchPageOnce: <
    Q extends PiiFieldTypeDefinition,
  >(
    expected?: {
      where: WhereClause<any>;
      orderBy: Record<string, "asc" | "desc" | undefined>;
    },
  ) => DeferredPromise<
    PageResult<Partial<Coach.Instance<Q>>>
  >;
}

function mockLog(...args: any[]) {
  // eslint-disable-next-line no-console
  console.log(
    chalk.yellow("mockClient"),
    ...args,
  );
}

/**
 * Testing utilities for PrivacyScrubClient implementation.
 * - Mock creation helpers for client, observers, and callbacks
 * - Expectation utilities for validating payloads
 * - Tools for managing test lifecycle and cleanup
 * - Creates a colorized logger for test environments
 */
export function createTestLogger(
  bindings: Record<string, any>,
  options?: { level?: string; msgPrefix?: string },
): Logger {
  const colors = {
    debug: [chalk.cyan, chalk.bgCyan],
    info: [chalk.green, chalk.bgGreen],
    trace: [chalk.gray, chalk.bgGray],
    error: [chalk.red, chalk.bgRed],
    warn: [chalk.yellow, chalk.bgYellow],
    fatal: [chalk.redBright, chalk.bgRedBright],
  } as const;
  function createLogMethod(
    name: "debug" | "error" | "info" | "warn" | "fatal" | "trace",
  ) {
    return vi.fn<Logger.LogFn>(
      (
        ...args: [
          obj: unknown,
          ...args1: any[],
        ] | [
          ...args2: any[],
        ]
      ) => {
        const hasData = args.length > 0 && typeof args[0] !== "string";
        const obj: Record<string, unknown> = hasData ? args[0] as any : {};
        const more: any[] = hasData ? args.slice(1) : args.slice(0);

        // eslint-disable-next-line no-console
        console.log(
          `${colors[name][1](name)}${
            options?.msgPrefix ? " " + colors[name][0](options.msgPrefix) : ""
          }${obj?.methodName ? ` .${chalk.magenta(obj.methodName)}()` : ""}`,
          ...more,
        );
        if (bindings && Object.keys(bindings).length > 0) {
          // eslint-disable-next-line no-console
          console.log(bindings);
        }
      },
    ) as Logger.LogFn;
  }
  return {
    debug: createLogMethod("debug"),
    error: createLogMethod("error"),
    info: createLogMethod("info"),
    warn: createLogMethod("warn"),
    fatal: createLogMethod("fatal"),
    child: vi.fn<Logger["child"]>((theseBindings, theseOptions) =>
      createTestLogger({
        ...bindings,
        ...theseBindings,
      }, {
        level: (theseOptions ?? options)?.level,
        msgPrefix: options?.msgPrefix || theseOptions?.msgPrefix
          ? `${options?.msgPrefix ? `${options.msgPrefix} ` : ""}${
            theseOptions?.msgPrefix || ""
          }`
          : undefined,
      })
    ),
    trace: createLogMethod("trace"),
    isLevelEnabled: vi.fn((args) => true),
  };
}

/**
 * Creates mocked client helpers with deferred promise control
 */
export function createClientMockHelper(): MockClientHelper {
  const client = vitest.fn<typeof client>() as unknown as Mock<Client> & Client;

  const logger = createTestLogger({});

  // this is just a fallback for when there is nothing set so we can track whats up
  client.mockImplementation((...args: any[]) => {
    const localLogger = logger.child({}, { msgPrefix: "fallback mock client" });
    try {
      throw new Error("IN THE FALLBACK MOCK CLIENT IMPLEMENTATION");
    } catch (e) {
      localLogger.error("Just for the stack trace", e);
    }

    let where;
    const deadPipelineSet = {
      where: (...whereArgs: any[]) => {
        localLogger.trace("where", whereArgs);
        where = whereArgs;
        return deadPipelineSet;
      },
      fetchPage: (...fetchArgs: any[]) => {
        localLogger.trace("fetchPage", where!, fetchArgs);
        throw new Error("NO");
      },
      fetchOne: (...fetchArgs: any[]) => {
        localLogger.trace("fetchOne", fetchArgs);

        throw new Error("NO");
      },
    };
    return deadPipelineSet;
  });

  client[additionalContext] = {
    baseUrl: "http://localhost:8080",
    gameStateRid: "ri.something",
    objectFactory: vitest.fn(),
    gameStateProvider: {
      getActionDefinition: vitest.fn(),
      getInterfaceDefinition: vitest.fn(),
      getObjectDefinition: vitest.fn(),
      getScrubDefinition: vitest.fn(),
    },
    tokenProvider: vitest.fn(),
    objectSetFactory: vitest.fn(),
    fetch: vitest.fn(),
    clientPiiFieldKey: {} as any,
    requestContext: {},
    logger,
    narrowTypeInterfaceOrObjectMapping: {},
  };
  client.fetchMetadata = vitest.fn();

  function mockObjectFactoryOnce() {
    const d = pDefer<
      (
        | Coach.Instance<ObjectOrInterfaceDefinition, never, any, {}>
        | ScrubRecord
      )[]
    >();
    vi.mocked(client[additionalContext].objectFactory).mockReturnValueOnce(
      d.promise as Promise<ScrubRecord[]>,
    );
    return d;
  }

  function mockFetchPageOnce<
    X extends PageResult<
      Coach.Instance<PiiFieldTypeDefinition>
    >,
  >(): DeferredPromise<X> {
    const d = pDefer<X>();

    const pipelineSet: PipelineSet<PiiFieldTypeDefinition> = {
      fetchPage: async (fetchPageArgs: FetchPageArgs<any>) => {
        mockLog("fetchPage", fetchPageArgs);
        const r = await d.promise;
        return { ...r, $piiKey: fetchPageArgs };
      },
      where: (clause) => {
        mockLog("where", clause);
        return pipelineSet;
      },
    } as Pick<
      PipelineSet<PiiFieldTypeDefinition>,
      "fetchPage" | "where"
    > as PipelineSet<PiiFieldTypeDefinition>;

    client.mockReturnValueOnce(pipelineSet);
    return d;
  }

  function mockFetchOneOnce<
    X extends Partial<CoachBase<any>>,
  >(expectedId?: string | number | boolean): DeferredPromise<X> {
    const d = pDefer<X>();

    client.mockReturnValueOnce(
      {
        fetchOne: async (a: FetchPageArgs<any>) => {
          mockLog("fetchOne", a);
          invariant(
            expectedId === undefined || a === expectedId,
            "expected id to match",
          );
          const r = await d.promise;
          invariant(
            r.$piiKey === a,
            `expected id to match. Got ${
              JSON.stringify(a)
            } but object to return was ${r.$piiKey}`,
          );
          return r as Coach.Instance<any>;
        },
      } as Pick<PipelineSet<PiiFieldTypeDefinition>, "fetchOne">,
    );
    return d;
  }

  function mockApplyActionOnce(): DeferredPromise<
    Partial<ActionEditResponse>
  > {
    const d = pDefer<Partial<ActionEditResponse>>();

    client.mockReturnValueOnce(
      {
        applyAction: async (_args): Promise<ActionEditResponse> => {
          const x = await d.promise;
          return {
            type: "edits",
            addedLinks: x.addedLinks ?? [],
            addedObjects: x.addedObjects ?? [],
            deletedObjects: x.deletedObjects ?? [],
            deletedLinks: x.deletedLinks ?? [],
            deletedLinksCount: x.deletedLinksCount ?? 0,
            deletedObjectsCount: x.deletedObjectsCount ?? 0,
            editedPiiFieldTypes: x.editedPiiFieldTypes ?? [],
            modifiedObjects: x.modifiedObjects ?? [],
          };
        },
      } as Pick<
        ActionSignatureFromDef<ActionDefinition>,
        "applyAction"
      >,
    );
    return d;
  }

  return {
    client,
    mockApplyActionOnce,
    mockFetchOneOnce,
    mockObjectFactoryOnce,
    mockFetchPageOnce,
  };
}

/**
 * Manages test subscriptions with automatic cleanup
 */
export function createDefer() {
  let subscriptions: ScrubDisposable[];

  beforeEach(() => {
    subscriptions = [];
  });

  afterEach(() => {
    for (const s of subscriptions) {
      (s as any).unsubscribe();
    }
    subscriptions = [];
  });

  return function defer(x: ScrubDisposable): ScrubDisposable {
    subscriptions.push(x);
    return x;
  };
}

export function expectSingleLinkCallAndClear<T extends PiiFieldTypeDefinition>(
  subFn: MockedObject<Observer<SpecificLinkPayload | undefined>>,
  resolvedScrubField: ScrubRecord[] | Coach.Instance<T>[] | undefined,
  payloadOptions: Omit<Partial<SpecificLinkPayload>, "resolvedScrubField"> = {},
): SpecificLinkPayload | undefined {
  if (vitest.isFakeTimers()) {
    vitest.runOnlyPendingTimers();
  }
  expect(subFn.next).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining(
      linkPayloadContaining({
        ...payloadOptions,
        resolvedScrubField: resolvedScrubField as unknown as Array<
          ScrubRecord
        >,
      }),
    ),
  );

  const ret = subFn.next.mock.calls[0][0];
  subFn.next.mockClear();
  return ret;
}

export function expectSingleScrubFieldCallAndClear<T extends PiiFieldTypeDefinition>(
  subFn: MockedObject<Observer<ScrubFieldPayload | undefined>>,
  resolvedScrubField: ScrubRecord[] | Coach.Instance<T>[] | undefined,
  payloadOptions: Omit<Partial<ScrubFieldPayload>, "resolvedScrubField"> = {},
): ScrubFieldPayload | undefined {
  if (vitest.isFakeTimers()) {
    vitest.runOnlyPendingTimers();
  }
  expect(subFn.next).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining(
      scrubFieldPayloadContaining({
        ...payloadOptions,
        resolvedScrubField: resolvedScrubField as unknown as Array<
          ScrubRecord
        >,
      }),
    ),
  );
  const ret = subFn.next.mock.calls[0][0];
  subFn.next.mockClear();
  return ret;
}

/**
 * Validates object payload emissions in tests
 */
export function expectSingleObjectCallAndClear<T extends PiiFieldTypeDefinition>(
  subFn: MockedObject<Observer<ObjectPayload | undefined>>,
  object: Coach.Instance<T> | undefined,
  status?: Status,
): ObjectPayload | undefined {
  expect(subFn.next).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      object,
      status: status ?? expect.any(String),
    }),
  );

  const ret = subFn.next.mock.calls[0][0];
  subFn.next.mockClear();
  return ret;
}

export async function waitForCall(
  subFn: Mock<(e: any) => void> | MockedObject<Observer<any>>,
  times: number = 1,
): Promise<void> {
  if ("next" in subFn && "error" in subFn && "complete" in subFn) {
    subFn = subFn.next;
  }
  try {
    await vi.waitFor(() => {
      expect(subFn).toHaveBeenCalledTimes(times);
    }, {
      interval: 0,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log(
      `We are going to fail waiting for ${times} calls because these are our calls: `,
      inspect(subFn.mock.calls, {
        depth: 9,
        colors: true,
        compact: 2,
      }),
    );
    // we don't need the error, it will retrigger on the next line
    // and that provides better behavior in the vitest vscode
    // plugin. This places the error in the test itself instead of
    // only in this file
  }
  expect(subFn).toHaveBeenCalledTimes(times);
}

export async function waitForPayload<T>(
  observer: MockedObject<Observer<T>>,
  predicate: (payload: T) => boolean,
): Promise<T> {
  await vi.waitFor(() => {
    const calls = observer.next.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const last = calls[calls.length - 1][0];
    expect(predicate(last)).toBe(true);
  }, { interval: 0 });
  return observer.next.mock.calls[observer.next.mock.calls.length - 1][0];
}

export function expectNoMoreCalls(
  observer: MockedObject<
    Observer<any>
  >,
): void {
  expect(observer.next).not.toHaveBeenCalled();
  expect(observer.error).not.toHaveBeenCalled();
}

function createSubscriptionHelper() {
}

export type MockedSingleSubCallback =
  & MockedObject<Observer<ObjectPayload | undefined>>
  & {
    // expectLoaded: (value: unknown) => Promise<void>;
    // expectLoading: (value: unknown) => Promise<void>;
    expectLoadingAndLoaded: (q: {
      loading?: unknown;
      loaded: unknown;
    }) => Promise<void>;
  };

export function mockSingleSubCallback(): MockedSingleSubCallback {
  const ret = mockObserver<ObjectPayload | undefined>();

  //   async function expectLoaded(value: unknown) {
  //     await waitForCall(ret);
  //     // as long as we get the loaded call we are happy
  //     expect(ret).toHaveBeenLastCalledWith(
  //       cacheEntryContaining({
  //         value,
  //         status: "loaded",
  //       }),
  //     );
  //     ret.mockClear();
  //   }

  //   async function expectLoading(value: unknown) {
  //     await waitForCall(ret);
  //     // as long as we get the loaded call we are happy
  //     expect(ret).toHaveBeenCalledExactlyOnceWith(
  //       cacheEntryContaining({
  //         value,
  //         status: "loading",
  //       }),
  //     );
  //     ret.mockClear();
  //   }

  return Object.assign(ret, {
    // expectLoaded,
    // expectLoading,
    expectLoadingAndLoaded: async (
      q: { loading?: unknown; loaded: unknown },
    ) => {
      await waitForCall(ret.next, 2);

      // as long as we get the loaded call we are happy
      expect(ret.next).toHaveBeenNthCalledWith(
        1,
        q.loading,
      );
      expect(ret.next).toHaveBeenNthCalledWith(
        2,
        q.loaded,
      );
      expect(ret.next).toHaveBeenCalledTimes(2);
      ret.next.mockClear();
    },
  });
}

export function mockObserver<T>(): MockedObject<Observer<T>> {
  return {
    next: vitest.fn(),

    // error: vitest.fn((x) => console.error(x)),
    error: vitest.fn(),
    complete: vitest.fn(),
  };
}

// todo: find uses of this and replace with direct call to mockObserver<ScrubFieldPayload | undefined>
export function mockScrubFieldSubCallback(): MockedObject<
  Observer<ScrubFieldPayload | undefined>
> {
  return mockObserver<ScrubFieldPayload | undefined>();
}

// todo: find uses of this and replace with direct call to mockObserver<SpecificLinkPayload | undefined>
export function mockLinkSubCallback(): MockedObject<
  Observer<SpecificLinkPayload | undefined>
> {
  return mockObserver<SpecificLinkPayload | undefined>();
}

export function cacheEntryContaining(x: Partial<Entry<any>>): Entry<any> {
  return {
    piiFieldKey: (x as any).piiFieldKey ?? expect.any(Object),
    value: "value" in x
      ? x.value
      : expect.toBeOneOf([expect.anything(), undefined]),
    status: x.status ?? expect.anything(),
    lastUpdated: (x as any).lastUpdated ?? expect.anything(),
  };
}

function nonOptionalValue<T extends object, K extends keyof T>(
  src: T,
  key: K,
): NonNullable<T[K]> {
  return key in src
    ? src[key]
    : expect.toBeOneOf([expect.anything(), undefined]);
}

export function objectPayloadContaining(
  x: Partial<ObjectPayload>,
): ObjectPayload {
  return {
    object: nonOptionalValue(x, "object"),
    isDeferred: expect.any(Boolean),
    status: x.status ?? expect.anything(),
    lastUpdated: (x as any).lastUpdated ?? expect.anything(),
  };
}

export function scrubFieldPayloadContaining(
  x: Partial<ScrubFieldPayload>,
): ScrubFieldPayload {
  return {
    fetchMore: (x as any).fetchMore ?? expect.any(Function),
    hasMore: (x as any).hasMore ?? expect.any(Boolean),
    resolvedScrubField: "resolvedScrubField" in x
      ? x.resolvedScrubField
      : expect.anything(),
    isDeferred: expect.any(Boolean),
    status: x.status ?? expect.anything(),
    lastUpdated: (x as any).lastUpdated ?? expect.anything(),
    pipelineSet: (x as any).pipelineSet ?? expect.anything(),
  } as ScrubFieldPayload;
}

export function linkPayloadContaining(
  x: Partial<SpecificLinkPayload>,
): SpecificLinkPayload {
  return {
    fetchMore: x.fetchMore ?? expect.any(Function),
    hasMore: x.hasMore ?? expect.any(Boolean),
    resolvedScrubField: "resolvedScrubField" in x
      ? x.resolvedScrubField
      : expect.anything(),
    isDeferred: expect.any(Boolean),
    status: x.status ?? expect.anything(),
    lastUpdated: x.lastUpdated ?? expect.anything(),
    ...("totalCount" in x
      ? { totalCount: x.totalCount }
      : {}),
    linkedObjectsBySourcePrimaryKey: x.linkedObjectsBySourcePrimaryKey
      ?? expect.anything(),
  };
}

export function applyCustomMatchers(): void {
  expect.extend({
    toBeGreaterThan: (r: number, e: number) => {
      return {
        pass: r > e,
        message: () => `expected ${r} to be greater than ${e} (lastUpdated)`,
      };
    },
  });
}

interface CustomMatchers<R = any> {
  toBeGreaterThan: (n: number) => R;
}

interface CustomAsymmetricMatchers<R = any> {
  toBeGreaterThan: (n: number) => R;
}

declare module "vitest" {
  interface Assertion<T = any> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomAsymmetricMatchers {}
}

/**
 * Updates the internal state of a scrubField and will create a new internal query if needed.
 *
 * Helper method only for tests right now. May be removed later.
 *
 * @param apiName
 * @param where
 * @param orderBy
 * @param objects
 * @param param4
 * @param opts
 */
export function updateScrubField<T extends ObjectOrInterfaceDefinition>(
  store: Store,
  {
    type,
    where,
    orderBy,
  }: {
    type: Pick<T, "apiName" | "type">;
    where: WhereClause<T>;
    orderBy: OrderBy<T>;
  },
  objects: ScrubRecord[] | Coach.Instance<T>[],
  { deferredId }: { deferredId?: DeferredId } = {},
  opts: ScrubFieldQueryOptions<T> = { dedupeInterval: 0 },
): void {
  if (process.env.NODE_ENV !== "production") {
    store.logger?.child({ methodName: "updateScrubField" }).info(
      "",
      { deferredId },
    );
  }

  const query = store.scrubFields.getQuery({
    ...opts,
    type,
    where: where ?? {},
    orderBy: orderBy ?? {},
  });

  store.batch({ deferredId }, (batch) => {
    const rdpConfig = query.rdpConfig;
    const objectPiiFieldKeys = store.objects.storeOsdkInstances(
      objects,
      batch,
      rdpConfig,
    );
    query._updateScrubField(objectPiiFieldKeys, "loaded", batch, {
      type: "clientOrdered",
    });
  });
}

export function getObject(
  store: Store,
  type: string,
  pk: number,
): ScrubRecord | undefined {
  return store.getValue(
    store.piiFieldKeys.get<ObjectPiiFieldKey>("object", type, pk),
  )?.value;
}

export function updateObject<T extends ObjectOrInterfaceDefinition>(
  store: Store,
  value: Coach.Instance<T>,
  { deferredId }: { deferredId?: DeferredId } = {},
): Coach.Instance<T> {
  const query = store.objects.getQuery({
    apiName: value.$apiName,
    pk: value.$piiKey,
  }, undefined);

  store.batch({ deferredId }, (batch) => {
    return query.writeToStore(
      value as unknown as ScrubRecord<typeof value>,
      "loaded",
      batch,
    );
  });

  return value;
}
