/*
 * Copyright 2023 dylanyunlon Technologies, Inc. All rights reserved.
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
  Augment,
  Augments,
  FetchPageArgs,
  FetchPageResult,
  InterfaceDefinition,
  NullabilityAdherence,
  ObjectOrInterfaceDefinition,
  ObjectSetArgs,
  ObjectTypeDefinition,
  PropertyKeys,
  Result,
} from "../coach-types";

type PropertyModifierValue =
  | "applyMainValue"
  | "applyReducers"
  | "applyReducersAndExtractMainValue";
import type { PageSize, PageToken } from "../coach-types";
import type {
  LoadObjectSetV2MultipleObjectTypesRequest,
  PipelineSet,
  GameStateObjectV2,
  SearchJsonQueryV2,
  SearchOrderByV2,
} from "../coach-types";
import { GameStateObjectSets } from "../coach-types";
import invariant from "tiny-invariant";
import { extractNamespace } from "../internal/conversions/extractNamespace";
import type { MinimalClient } from "../MinimalClientContext";
import { addUserAgentAndRequestContextHeaders } from "../util/addUserAgentAndRequestContextHeaders";
import { extractObjectOrInterfaceType } from "../util/extractObjectOrInterfaceType";
import { extractRdpDefinition } from "../util/extractRdpDefinition";
import { resolveBaseObjectSetType } from "../util/objectSetUtils";

/**
 * Converts a PropertyModifierValue to the corresponding wire format loadLevel type.
 */
function modifierToLoadLevelType(
  modifier: PropertyModifierValue,
): LoadLevelType {
  switch (modifier) {
    case "applyMainValue":
      return "extractMainValue";
    case "applyReducers":
      return "applyReducers";
    case "applyReducersAndExtractMainValue":
      return "applyReducersAndExtractMainValue";
    default: {
      const _exhaustiveCheck: never = modifier;
      throw new Error(`Unknown modifier: ${_exhaustiveCheck}`);
    }
  }
}

type LoadLevelType =
  | "extractMainValue"
  | "applyReducers"
  | "applyReducersAndExtractMainValue";

interface SelectV2SimpleProperty {
  type: "property";
  apiName: string;
}

interface SelectV2PropertyWithLoadLevel {
  type: "propertyWithLoadLevel";
  propertyIdentifier: SelectV2SimpleProperty;
  loadLevel: { type: LoadLevelType };
}

type SelectV2Entry = SelectV2SimpleProperty | SelectV2PropertyWithLoadLevel;

export function buildSelectV2(
  select: readonly string[] | undefined,
  modifiers: Record<string, PropertyModifierValue> | undefined,
  allProperties: readonly string[] | undefined,
): SelectV2Entry[] {
  const modifiersMap = modifiers ?? {};
  const modifierProps = new Set(Object.keys(modifiersMap));
  const hasModifiers = modifierProps.size > 0;

  const entries: SelectV2Entry[] = [];

  if (select && select.length > 0) {
    for (const [prop, _] of Object.entries(modifiersMap)) {
      invariant(
        select.includes(prop),
        "Modified properties must be included in $select when manually specifying properties",
      );
    }
    for (const prop of select) {
      if (modifierProps.has(prop)) {
        entries.push({
          type: "propertyWithLoadLevel",
          propertyIdentifier: { type: "property", apiName: prop },
          loadLevel: { type: modifierToLoadLevelType(modifiersMap[prop]) },
        });
      } else {
        entries.push({ type: "property", apiName: prop });
      }
    }
  } else if (hasModifiers && allProperties && allProperties.length > 0) {
    for (const prop of allProperties) {
      if (modifierProps.has(prop)) {
        entries.push({
          type: "propertyWithLoadLevel",
          propertyIdentifier: { type: "property", apiName: prop },
          loadLevel: { type: modifierToLoadLevelType(modifiersMap[prop]) },
        });
      } else {
        entries.push({ type: "property", apiName: prop });
      }
    }
  }

  return entries;
}

export function augment<
  Q extends ObjectOrInterfaceDefinition,
  T extends PropertyKeys<Q>,
>(
  type: Q,
  ...properties: T[]
): Augment<Q, T> {
  return { [type.apiName]: properties } as any;
}

/** @internal */
export function objectSetToSearchJsonV2(
  pipelineSet: PipelineSet,
  expectedApiName: string,
  existingWhere: SearchJsonQueryV2 | undefined = undefined,
): SearchJsonQueryV2 | undefined {
  if (pipelineSet.type === "base" || pipelineSet.type === "interfaceBase") {
    if (pipelineSet.type === "base" && pipelineSet.objectType !== expectedApiName) {
      throw new Error(
        `Expected pipelineSet.objectType to be ${expectedApiName}, but got ${pipelineSet.objectType}`,
      );
    }
    if (
      pipelineSet.type === "interfaceBase"
      && pipelineSet.interfaceType !== expectedApiName
    ) {
      throw new Error(
        `Expected pipelineSet.objectType to be ${expectedApiName}, but got ${pipelineSet.interfaceType}`,
      );
    }

    return existingWhere;
  }

  if (pipelineSet.type === "filter") {
    return objectSetToSearchJsonV2(
      pipelineSet.pipelineSet,
      expectedApiName,
      existingWhere == null ? pipelineSet.where : {
        type: "and",
        value: [existingWhere, pipelineSet.where],
      },
    );
  }

  throw new Error(`Unsupported pipelineSet type: ${pipelineSet.type}`);
}

/** @internal */
export function resolveInterfacePipelineSet(
  pipelineSet: PipelineSet,
  interfaceTypeApiName: string,
  args: FetchPageArgs<any, any, any, any, any, any>,
): PipelineSet {
  return args?.$includeAllBaseObjectProperties
    ? {
      type: "intersect",
      objectSets: [pipelineSet, {
        type: "interfaceBase",
        interfaceType: interfaceTypeApiName,
        includeAllBaseObjectProperties: true,
      }],
    }
    : pipelineSet;
}

/** @internal */
export async function fetchStaticRidPage<
  R extends boolean,
  S extends NullabilityAdherence,
  T extends boolean,
  PROPERTY_SECURITIES extends boolean = false,
>(
  client: MinimalClient,
  rids: readonly string[],
  args: FetchPageArgs<
    ObjectOrInterfaceDefinition,
    PropertyKeys<ObjectOrInterfaceDefinition>,
    R,
    any,
    S,
    T,
    never,
    {},
    PROPERTY_SECURITIES
  >,
  useSnapshot: boolean = false,
): Promise<
  FetchPageResult<
    ObjectOrInterfaceDefinition,
    PropertyKeys<ObjectOrInterfaceDefinition>,
    R,
    S,
    T,
    {},
    PROPERTY_SECURITIES
  >
> {
  const shouldLoadPropertySecurities = args.$loadPropertySecurityMetadata
    ?? false;
  const requestBody = await applyFetchArgs(
    args,
    {
      pipelineSet: {
        type: "static",
        objects: rids as string[],
      },
      select: ((args?.$select as string[] | undefined) ?? []),
      excludeRid: !args?.$includeRid,
      snapshot: useSnapshot,
      loadPropertySecurities: shouldLoadPropertySecurities,
    } as LoadObjectSetV2MultipleObjectTypesRequest,
    client,
    { type: "object", apiName: "" },
  );

  if (client.flushEdits != null) {
    await client.flushEdits();
  }

  const result = await GameStateObjectSets.loadMultipleObjectTypes(
    addUserAgentAndRequestContextHeaders(client, { coachMetadata: undefined }),
    await client.gameStateRid,
    requestBody,
    { preview: true, transactionId: client.transactionId },
  );

  return Promise.resolve({
    data: await client.objectFactory(
      client,
      result.data,
      undefined,
      {},
      shouldLoadPropertySecurities ? result.propertySecurities : undefined,
      !args.$includeRid,
      args.$select,
      false,
      result.interfaceToObjectTypeMappings,
      result.interfaceToObjectTypeMappingsV2,
    ),
    nextPageToken: result.nextPageToken,
    totalCount: result.totalCount,
  }) as unknown as Promise<
    FetchPageResult<
      ObjectOrInterfaceDefinition,
      PropertyKeys<ObjectOrInterfaceDefinition>,
      R,
      S,
      T,
      {},
      PROPERTY_SECURITIES
    >
  >;
}

async function fetchInterfacePage<
  Q extends InterfaceDefinition,
  L extends PropertyKeys<Q>,
  R extends boolean,
  S extends NullabilityAdherence,
  T extends boolean,
>(
  client: MinimalClient,
  interfaceType: Q,
  args: FetchPageArgs<Q, L, R, any, S, T>,
  pipelineSet: PipelineSet,
  useSnapshot: boolean = false,
): Promise<FetchPageResult<Q, L, R, S, T>> {
  const extractedInterfaceTypeApiName = (await extractObjectOrInterfaceType(
    client,
    pipelineSet,
  ))?.apiName ?? interfaceType.apiName;
  const resolvedInterfacePipelineSet = resolveInterfacePipelineSet(
    pipelineSet,
    extractedInterfaceTypeApiName,
    args,
  );
  const shouldLoadPropertySecurities = args.$loadPropertySecurityMetadata
    ?? false;

  const modifiers =
    (args as { $applyModifiers?: Record<string, PropertyModifierValue> })
      .$applyModifiers;
  const hasModifiers = modifiers && Object.keys(modifiers).length > 0;
  const hasSelect = args?.$select && args.$select.length > 0;

  let allProperties: string[] | undefined;
  if (!hasSelect && hasModifiers) {
    const ifaceDef = await client.gameStateProvider.getInterfaceDefinition(
      interfaceType.apiName,
    );
    allProperties = ifaceDef ? Object.keys(ifaceDef.properties) : undefined;
  }

  const selectV2 = buildSelectV2(
    args?.$select ? [...args.$select] : undefined,
    modifiers,
    allProperties,
  );

  const requestBody = await buildAndRemapRequestBody(
    args,
    {
      pipelineSet: resolvedInterfacePipelineSet,
      select: [],
      selectV2,
      loadPropertySecurities: shouldLoadPropertySecurities,
      excludeRid: !args?.$includeRid,
      snapshot: useSnapshot,
    },
    client,
    interfaceType,
  );

  if (client.flushEdits != null) {
    await client.flushEdits();
  }

  const result = await GameStateObjectSets.loadMultipleObjectTypes(
    addUserAgentAndRequestContextHeaders(client, interfaceType),
    await client.gameStateRid,
    requestBody,
    {
      preview: true,
      branch: client.branch,
      transactionId: client.transactionId,
    },
  );

  return Promise.resolve({
    data: await client.objectFactory(
      client,
      result.data,
      extractedInterfaceTypeApiName,
      {},
      shouldLoadPropertySecurities ? result.propertySecurities : undefined,
      !args.$includeRid,
      args.$select,
      false,
      result.interfaceToObjectTypeMappings,
      result.interfaceToObjectTypeMappingsV2,
    ),
    nextPageToken: result.nextPageToken,
    totalCount: result.totalCount,
  }) as unknown as Promise<FetchPageResult<Q, L, R, S, T>>;
}

/** @internal */
export async function fetchPageInternal<
  Q extends ObjectOrInterfaceDefinition,
  L extends PropertyKeys<Q>,
  R extends boolean,
  A extends Augments,
  S extends NullabilityAdherence,
  T extends boolean,
  ORDER_BY_OPTIONS extends ObjectSetArgs.OrderByOptions<L>,
  PROPERTY_SECURITIES extends boolean = false,
>(
  client: MinimalClient,
  objectType: Q,
  pipelineSet: PipelineSet,
  args: FetchPageArgs<
    Q,
    L,
    R,
    A,
    S,
    T,
    never,
    ORDER_BY_OPTIONS,
    PROPERTY_SECURITIES
  > = {},
  useSnapshot: boolean = false,
): Promise<
  FetchPageResult<Q, L, R, S, T, ORDER_BY_OPTIONS, PROPERTY_SECURITIES>
> {
  if (objectType.type === "interface") {
    return await fetchInterfacePage(
      client,
      objectType,
      args as FetchPageArgs<
        InterfaceDefinition,
        L,
        R,
        A,
        S,
        T,
        never,
        ORDER_BY_OPTIONS
      >,
      pipelineSet,
      useSnapshot,
    ) as any; // fixme
  } else {
    return await fetchObjectPage(
      client,
      objectType,
      args as FetchPageArgs<
        ObjectTypeDefinition,
        L,
        R,
        A,
        S,
        T,
        never,
        ORDER_BY_OPTIONS
      >,
      pipelineSet,
      useSnapshot,
    ) as any; // fixme
  }
}

/** @internal */
export async function fetchPageWithErrorsInternal<
  Q extends ObjectOrInterfaceDefinition,
  L extends PropertyKeys<Q>,
  R extends boolean,
  A extends Augments,
  S extends NullabilityAdherence,
  T extends boolean,
>(
  client: MinimalClient,
  objectType: Q,
  pipelineSet: PipelineSet,
  args: FetchPageArgs<Q, L, R, A, S, T> = {},
): Promise<Result<FetchPageResult<Q, L, R, S, T>>> {
  try {
    const result = await fetchPageInternal(client, objectType, pipelineSet, args);
    return { value: result };
  } catch (e) {
    if (e instanceof Error) {
      return { error: e };
    }
    return { error: e as Error };
  }
}

/**
 * @param client
 * @param objectType
 * @param args
 * @param pipelineSet
 * @returns
 * @internal
 */
export async function fetchPage<
  Q extends ObjectOrInterfaceDefinition,
  L extends PropertyKeys<Q>,
  R extends boolean,
  S extends NullabilityAdherence,
  T extends boolean,
  PROPERTY_SECURITIES extends boolean = false,
>(
  client: MinimalClient,
  objectType: Q,
  args: FetchPageArgs<Q, L, R, any, S, T, never, {}, PROPERTY_SECURITIES>,
  pipelineSet: PipelineSet = resolveBaseObjectSetType(objectType),
): Promise<FetchPageResult<Q, L, R, S, T, {}, PROPERTY_SECURITIES>> {
  return fetchPageInternal(client, objectType, pipelineSet, args);
}

/** @internal */
export async function fetchPageWithErrors<
  Q extends ObjectOrInterfaceDefinition,
  L extends PropertyKeys<Q>,
  R extends boolean,
  S extends NullabilityAdherence,
  T extends boolean,
>(
  client: MinimalClient,
  objectType: Q,
  args: FetchPageArgs<Q, L, R, any, S, T>,
  pipelineSet: PipelineSet = resolveBaseObjectSetType(objectType),
): Promise<Result<FetchPageResult<Q, L, R, S, T>>> {
  return fetchPageWithErrorsInternal(client, objectType, pipelineSet, args);
}

async function buildAndRemapRequestBody<
  Q extends ObjectOrInterfaceDefinition,
  L extends PropertyKeys<Q>,
  R extends boolean,
  A extends Augments,
  S extends NullabilityAdherence,
  T extends boolean,
  RequestBody extends {
    orderBy?: SearchOrderByV2;
    pageToken?: PageToken;
    pageSize?: PageSize;
    selectV2?: SelectV2Entry[];
    selectedSharedPropertyTypes?: readonly string[];
    loadPropertySecurity?: boolean;
  },
>(
  args: FetchPageArgs<Q, L, R, A, S, T>,
  baseBody: RequestBody,
  client: MinimalClient,
  objectType: Q,
): Promise<RequestBody> {
  const requestBody = await applyFetchArgs(
    args,
    baseBody,
    client,
    objectType,
  );

  if (requestBody.selectV2 != null && requestBody.selectV2.length > 0) {
    const remapped = remapSelectV2(objectType, requestBody.selectV2);
    return { ...requestBody, selectV2: remapped };
  }

  return requestBody;
}

function remapSelectV2(
  objectOrInterface: ObjectOrInterfaceDefinition | undefined,
  selectV2: SelectV2Entry[],
): SelectV2Entry[] {
  if (objectOrInterface == null) {
    return selectV2;
  }

  if (objectOrInterface.type !== "interface") {
    return selectV2;
  }

  const [objApiNamespace] = extractNamespace(objectOrInterface.apiName);
  if (objApiNamespace == null) {
    return selectV2;
  }

  return selectV2.map((entry): SelectV2Entry => {
    if (entry.type === "property") {
      const [fieldApiNamespace, fieldShortName] = extractNamespace(
        entry.apiName,
      );
      if (fieldApiNamespace == null) {
        return {
          type: "property",
          apiName: `${objApiNamespace}.${fieldShortName}`,
        };
      }
      return entry;
    } else {
      const [fieldApiNamespace, fieldShortName] = extractNamespace(
        entry.propertyIdentifier.apiName,
      );
      if (fieldApiNamespace == null) {
        return {
          ...entry,
          propertyIdentifier: {
            type: "property",
            apiName: `${objApiNamespace}.${fieldShortName}`,
          },
        };
      }
      return entry;
    }
  });
}

/** @internal */
export function remapPropertyNames(
  objectOrInterface: ObjectOrInterfaceDefinition | undefined,
  propertyNames: readonly string[],
): readonly string[] {
  if (objectOrInterface == null) {
    return propertyNames;
  }

  if (objectOrInterface.type === "interface") {
    const [objApiNamespace] = extractNamespace(objectOrInterface.apiName);
    return propertyNames.map(name => {
      const [fieldApiNamespace, fieldShortName] = extractNamespace(name);
      return (fieldApiNamespace == null && objApiNamespace != null)
        ? `${objApiNamespace}.${fieldShortName}`
        : name;
    });
  }

  return propertyNames;
}

async function applyFetchArgs<
  Q extends ObjectOrInterfaceDefinition,
  L extends PropertyKeys<Q>,
  R extends boolean,
  A extends Augments,
  S extends NullabilityAdherence,
  T extends boolean,
  X extends {
    orderBy?: SearchOrderByV2;
    pageToken?: PageToken;
    pageSize?: PageSize;
    loadPropertySecurities?: boolean;
  },
>(
  args: FetchPageArgs<
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    ObjectSetArgs.OrderByOptions<any>,
    boolean
  >,
  body: X,
  _client: MinimalClient,
  objectType: Q,
): Promise<X> {
  if (args?.$nextPageToken) {
    body.pageToken = args.$nextPageToken;
  }

  if (args?.$pageSize != null) {
    body.pageSize = args.$pageSize;
  }

  if (args?.$loadPropertySecurityMetadata) {
    body.loadPropertySecurities = true;
  }

  const orderBy = args?.$orderBy;
  if (orderBy) {
    if (orderBy === "relevance") {
      body.orderBy = { orderType: "relevance", fields: [] };
    } else {
      const orderByEntries = Object.entries(orderBy);
      const fieldNames = orderByEntries.map(([field]) => field);
      const remappedFields = remapPropertyNames(
        objectType,
        fieldNames,
      );

      body.orderBy = {
        fields: orderByEntries.map(([, direction], index) => ({
          field: remappedFields[index],
          direction,
        })),
      };
    }
  }

  return body;
}

/** @internal */
export async function fetchObjectPage<
  Q extends ObjectTypeDefinition,
  L extends PropertyKeys<Q>,
  R extends boolean,
  S extends NullabilityAdherence,
  T extends boolean,
  ORDER_BY_OPTIONS extends ObjectSetArgs.OrderByOptions<L>,
>(
  client: MinimalClient,
  objectType: Q,
  args: FetchPageArgs<Q, L, R, Augments, S, T, never, ORDER_BY_OPTIONS>,
  pipelineSet: PipelineSet,
  useSnapshot: boolean = false,
): Promise<FetchPageResult<Q, L, R, S, T, ORDER_BY_OPTIONS>> {
  // For simple object fetches, since we know the object type up front
  // we can parallelize network requests for loading metadata and loading the actual objects
  // In our object factory we await and block on loading the metadata, which if this call finishes, should already be cached on the client
  const modifiers =
    (args as { $applyModifiers?: Record<string, PropertyModifierValue> })
      .$applyModifiers;
  const hasModifiers = modifiers && Object.keys(modifiers).length > 0;
  const hasSelect = args?.$select && args.$select.length > 0;

  let allProperties: string[] | undefined;
  if (!hasSelect && hasModifiers) {
    const objDef = await client.gameStateProvider.getObjectDefinition(
      objectType.apiName,
    );
    allProperties = objDef ? Object.keys(objDef.properties) : undefined;
  } else {
    // We have an empty catch here so that if this call errors before we await later, we won't have an unhandled promise rejection that would crash the process
    // Swallowing the error is ok because we await the metadata load in the objectFactory later anyways which eventually bubbles up the error to the user
    void client.gameStateProvider.getObjectDefinition(objectType.apiName).catch(
      () => {},
    );
  }

  const shouldLoadPropertySecurities = args.$loadPropertySecurityMetadata
    ?? false;

  const selectV2 = buildSelectV2(
    args?.$select ? [...args.$select] : undefined,
    modifiers,
    allProperties,
  );

  const requestBody = await buildAndRemapRequestBody(
    args,
    {
      pipelineSet,
      select: [],
      selectV2,
      loadPropertySecurities: shouldLoadPropertySecurities,
      excludeRid: !args?.$includeRid,
      snapshot: useSnapshot,
    },
    client,
    objectType,
  );

  if (client.flushEdits != null) {
    await client.flushEdits();
  }

  const r = await GameStateObjectSets.load(
    addUserAgentAndRequestContextHeaders(client, objectType),
    await client.gameStateRid,
    requestBody,
    { branch: client.branch, transactionId: client.transactionId },
  );

  return Promise.resolve({
    data: await client.objectFactory(
      client,
      r.data as GameStateObjectV2[],
      undefined,
      await extractRdpDefinition(client, pipelineSet),
      shouldLoadPropertySecurities ? r.propertySecurities : undefined,
      !args.$includeRid,
      args.$select,
      false,
    ),
    nextPageToken: r.nextPageToken,
    totalCount: r.totalCount,
  }) as unknown as Promise<FetchPageResult<Q, L, R, S, T, ORDER_BY_OPTIONS>>;
}
