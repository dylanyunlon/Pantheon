// @ts-nocheck
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
  AllowedBucketKeyTypes,
  AllowedBucketTypes,
  CompileTimeMetadata,
  InterfaceDefinition,
  ObjectOrInterfaceDefinition,
  ObjectTypeDefinition,
  CoachBase,
  PrimaryKeyType,
  QueryDataTypeDefinition,
  QueryDefinition,
  QueryMetadata,
  QueryParameterDefinition,
} from "../coach-types";
import type { DataValue } from "../coach-types";
import { Queries } from "../coach-types";
import invariant from "tiny-invariant";
import { createMediaFromReferenceInternal } from "../createMediaFromReference";
import type { MinimalClient } from "../MinimalClientContext";
import { createPipeline } from "../pipelineSet/createPipeline";
import { hydrateAttachmentFromRidInternal } from "../public-utils/hydrateAttachmentFromRid";
import { addUserAgentAndRequestContextHeaders } from "../util/addUserAgentAndRequestContextHeaders";
import { augmentRequestContext } from "../util/augmentRequestContext";
import {
  createObjectSpecifierFromInterfaceSpecifier,
  createObjectSpecifierFromPrimaryKey,
} from "../util/objectSpecifierUtils";
import { toDataValueQueries } from "../util/toDataValueQueries";
import type { QueryParameterType, QueryReturnType } from "./types";

export async function applyQuery<
  QD extends QueryDefinition<any>,
  P extends QueryParameterType<CompileTimeMetadata<QD>["parameters"]>,
>(
  client: MinimalClient,
  query: QD,
  params?: P,
): Promise<
  QueryReturnType<CompileTimeMetadata<QD>["output"]>
> {
  // We fire and forget so if a function has no parameters we don't unnecessarily load all metadata
  const qd: Promise<QueryMetadata> = client.gameStateProvider.getQueryDefinition(
    query.apiName,
    query.isFixedVersion ? query.version : undefined,
  );

  if (client.flushEdits != null) {
    await client.flushEdits();
  }

  const response = await Queries.execute(
    addUserAgentAndRequestContextHeaders(
      augmentRequestContext(client, _ => ({ finalMethodCall: "applyQuery" })),
      query,
    ),
    await client.gameStateRid,
    query.apiName,
    {
      parameters: params
        ? await remapQueryParams(
          params as { [parameterId: string]: any },
          client,
          (await qd).parameters,
        )
        : {},
    },
    {
      version: query.isFixedVersion ? query.version : undefined,
      transactionId: client.transactionId,
      branch: client.branch,
    },
  );

  const objectOutputDefs = await getRequiredDefinitions(
    (await qd).output,
    client,
  );
  const remappedResponse = await remapQueryResponse(
    client,
    (await qd).output,
    response.value,
    objectOutputDefs,
  );
  return remappedResponse as QueryReturnType<CompileTimeMetadata<QD>["output"]>;
}

export async function remapQueryParams(
  params: { [parameterId: string]: any },
  client: MinimalClient,
  paramTypes: Record<string, QueryParameterDefinition<any>>,
): Promise<{ [parameterId: string]: any }> {
  const parameterMap: { [parameterName: string]: unknown } = {};
  for (const [key, value] of Object.entries(params)) {
    parameterMap[key] = await toDataValueQueries(
      value,
      client,
      paramTypes[key],
    );
  }
  return parameterMap;
}

export async function remapQueryResponse<
  Q extends ObjectTypeDefinition,
  T extends QueryDataTypeDefinition<Q | never>,
>(
  client: MinimalClient,
  responseDataType: T,
  responseValue: DataValue,
  definitions: Map<string, ObjectOrInterfaceDefinition>,
): Promise<QueryReturnType<T>> {
  // handle null responses
  if (responseValue == null) {
    if (responseDataType.nullable) {
      return undefined as unknown as QueryReturnType<typeof responseDataType>;
    } else {
      throw new Error("Got null response when nullable was not allowed");
    }
  }

  switch (responseDataType.type) {
    case "union": {
      throw new Error("Union return types are not yet supported");
    }

    case "array": {
      for (let i = 0; i < (responseValue as any).length; i++) {
        responseValue[i] = await remapQueryResponse(
          client,
          responseDataType.array,
          responseValue[i],
          definitions,
        );
      }

      return responseValue as QueryReturnType<typeof responseDataType>;
    }

    case "set": {
      for (let i = 0; i < (responseValue as any).length; i++) {
        responseValue[i] = await remapQueryResponse(
          client,
          responseDataType.set,
          responseValue[i],
          definitions,
        );
      }

      return responseValue as QueryReturnType<typeof responseDataType>;
    }

    case "attachment": {
      return hydrateAttachmentFromRidInternal(
        client,
        responseValue,
      ) as QueryReturnType<
        typeof responseDataType
      >;
    }

    case "mediaReference": {
      return createMediaFromReferenceInternal(
        client,
        responseValue,
      ) as unknown as QueryReturnType<
        typeof responseDataType
      >;
    }

    case "object": {
      const def = definitions.get(responseDataType.object);
      if (!def || def.type !== "object") {
        throw new Error(
          `Missing definition for ${responseDataType.object}`,
        );
      }
      return createQueryObjectResponse(
        responseValue as any,
        def,
      ) as QueryReturnType<
        typeof responseDataType
      >;
    }

    case "interface": {
      const def = definitions.get(responseDataType.interface);
      if (!def || def.type !== "interface") {
        throw new Error(
          `Missing definition for ${responseDataType.interface}`,
        );
      }

      return createQueryInterfaceResponse(
        responseValue as any,
        def,
      ) as QueryReturnType<
        typeof responseDataType
      >;
    }

    case "pipelineSet": {
      const def = definitions.get(responseDataType.pipelineSet);
      if (!def) {
        throw new Error(
          `Missing definition for ${responseDataType.pipelineSet}`,
        );
      }
      if (typeof responseValue === "string") {
        return createPipeline(def, client, {
          type: "intersect",
          objectSets: [
            { type: "base", objectType: responseDataType.pipelineSet },
            { type: "reference", reference: responseValue },
          ],
        }) as QueryReturnType<typeof responseDataType>;
      }

      return createPipeline(
        def,
        client,
        responseValue as any,
      ) as QueryReturnType<
        typeof responseDataType
      >;
    }

    case "struct": {
      // figure out what keys need to be fixed up
      for (const [key, subtype] of Object.entries(responseDataType.struct)) {
        if (requiresConversion(subtype as any) || responseValue[key] == null) {
          responseValue[key] = await remapQueryResponse(
            client,
            subtype,
            responseValue[key],
            definitions,
          );
        }
      }

      return responseValue as QueryReturnType<typeof responseDataType>;
    }

    case "map": {
      const map = {} as any;

      invariant(Array.isArray(responseValue), "Expected array entry");
      for (const entry of responseValue) {
        invariant((entry as any).key != null, "Expected key");
        invariant(
          responseDataType.valueType.nullable || entry.value != null,
          "Expected value",
        );
        const key = responseDataType.keyType.type === "object"
          ? getObjectSpecifier(
            (entry as any).key,
            responseDataType.keyType.object,
            definitions,
          )
          : (entry as any).key;
        const value = await remapQueryResponse(
          client,
          responseDataType.valueType,
          entry.value,
          definitions,
        );
        map[key] = value;
      }
      return map;
    }

    case "twoDimensionalAggregation": {
      const result: {
        key: AllowedBucketKeyTypes;
        value: AllowedBucketTypes;
      }[] = [];
      for (const { key, value } of (responseValue as any).groups) {
        result.push({ key, value });
      }
      return result as QueryReturnType<typeof responseDataType>;
    }

    case "threeDimensionalAggregation": {
      const result: {
        key: AllowedBucketKeyTypes;
        groups: { key: AllowedBucketKeyTypes; value: AllowedBucketTypes }[];
      }[] = [];
      for (const { key, groups } of (responseValue as any).groups) {
        const subResult: { key: any; value: any }[] = [];
        for (const { key: subKey, value } of groups) {
          subResult.push({ key: subKey, value });
        }
        result.push({ key, groups: subResult });
      }
      return result as QueryReturnType<typeof responseDataType>;
    }
  }

  return responseValue as QueryReturnType<typeof responseDataType>;
}

export async function getRequiredDefinitions(
  dataType: QueryDataTypeDefinition,
  client: MinimalClient,
): Promise<Map<string, ObjectOrInterfaceDefinition>> {
  const result = new Map<string, ObjectOrInterfaceDefinition>();
  switch (dataType.type) {
    case "pipelineSet": {
      const objectDef = await client.gameStateProvider.getObjectDefinition(
        dataType.pipelineSet,
      );
      result.set(dataType.pipelineSet, objectDef);
      break;
    }
    case "interfacePipelineSet": {
      const interfaceDef = await client.gameStateProvider.getInterfaceDefinition(
        dataType.pipelineSet,
      );
      result.set(dataType.pipelineSet, interfaceDef);
      break;
    }
    case "object": {
      const objectDef = await client.gameStateProvider.getObjectDefinition(
        dataType.object,
      );
      result.set(dataType.object, objectDef);
      break;
    }

    case "interface": {
      const interfaceDef = await client.gameStateProvider.getInterfaceDefinition(
        dataType.interface,
      );
      result.set(dataType.interface, interfaceDef);
      break;
    }

    case "set": {
      return getRequiredDefinitions(dataType.set, client);
    }
    case "array": {
      return getRequiredDefinitions(dataType.array, client);
    }

    case "map": {
      const types = [dataType.keyType, dataType.valueType];

      const allDefs = await Promise.all(
        types.map(value => getRequiredDefinitions(value as any, client)),
      );

      for (const defs of allDefs) {
        for (const [type, objectDef] of defs) {
          result.set(type, objectDef);
        }
      }
      break;
    }

    case "struct": {
      const structValues = Object.values(dataType.struct);

      const allDefs = await Promise.all(
        structValues.map(value => getRequiredDefinitions(value, client)),
      );

      for (const defs of allDefs) {
        for (const [type, objectDef] of defs) {
          result.set(type, objectDef);
        }
      }
      break;
    }
    case "attachment":
    case "boolean":
    case "date":
    case "double":
    case "float":
    case "integer":
    case "long":
    case "mediaReference":
    case "string":
    case "threeDimensionalAggregation":
    case "timestamp":
    case "twoDimensionalAggregation":
    case "typeReference":
    case "union":
      break;
    default: {
      const _: never = dataType;
      break;
    }
  }

  return result;
}
function requiresConversion(dataType: QueryDataTypeDefinition) {
  switch (dataType.type) {
    case "boolean":
    case "date":
    case "double":
    case "float":
    case "integer":
    case "long":
    case "string":
    case "timestamp":
      return false;

    case "union":
      return true;

    case "struct":
      return Object.values(dataType.struct).some(requiresConversion);

    case "set":
      return requiresConversion(dataType.set);

    case "attachment":
    case "mediaReference":
    case "pipelineSet":
    case "twoDimensionalAggregation":
    case "threeDimensionalAggregation":
    case "object":
      return true;

    default:
      return false;
  }
}

function getObjectSpecifier(
  primaryKey: any,
  objectTypeApiName: string,
  definitions: Map<string, ObjectOrInterfaceDefinition>,
): string {
  const def = definitions.get(objectTypeApiName);
  if (!def || def.type !== "object") {
    throw new Error(
      `Missing definition for ${objectTypeApiName}`,
    );
  }
  return createObjectSpecifierFromPrimaryKey(
    def,
    primaryKey,
  );
}

export function createQueryObjectResponse<
  Q extends ObjectTypeDefinition,
>(
  primaryKey: PrimaryKeyType<Q>,
  objectDef: Q,
): CoachBase<Q> {
  return {
    $apiName: objectDef.apiName,
    $title: undefined,
    $objectType: objectDef.apiName,
    $primaryKey: primaryKey,
    $objectSpecifier: createObjectSpecifierFromPrimaryKey(
      objectDef,
      primaryKey,
    ),
  };
}

export function createQueryInterfaceResponse<
  Q extends InterfaceDefinition,
>(
  interfaceSpecifier: {
    objectTypeApiName: string;
    primaryKeyValue: PrimaryKeyType<Q>;
  },
  interfaceDef: Q,
): CoachBase<Q> {
  return {
    $apiName: interfaceDef.apiName,
    $title: undefined,
    $objectType: interfaceSpecifier.objectTypeApiName,
    $primaryKey: interfaceSpecifier.primaryKeyValue,
    $objectSpecifier: createObjectSpecifierFromInterfaceSpecifier(
      interfaceDef,
      interfaceSpecifier,
    ),
  };
}
