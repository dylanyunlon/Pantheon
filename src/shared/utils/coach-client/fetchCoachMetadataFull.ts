/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon COACH architecture patterns.
 *
 *     Coach-advisor module for Pantheon (League of Legends assistant)
 *
 */

import type {
  ActionDefinition,
  ActionMetadata,
  InterfaceDefinition,
  InterfaceMetadata,
  ObjectMetadata,
  ObjectTypeDefinition,
  QueryDefinition,
  QueryMetadata,
} from "@shared/utils/coach-types";
import type { MinimalClient } from "./MinimalClientContext.js";
import { InterfaceDefinitions } from "./gameState/GameStateProvider.js";

/** @internal */
export const fetchMetadataInternal = async <
  Q extends (
    | ObjectTypeDefinition
    | InterfaceDefinition
    | ActionDefinition<any>
    | QueryDefinition<any>
  ),
>(
  client: MinimalClient,
  definition: Q,
): Promise<
  Q extends ObjectTypeDefinition ? ObjectMetadata
    : Q extends InterfaceDefinition ? InterfaceMetadata
    : Q extends ActionDefinition<any> ? ActionMetadata
    : Q extends QueryDefinition<any> ? QueryMetadata
    : never
> => {
  if (definition.type === "object") {
    const { [InterfaceDefinitions]: interfaceDefs, ...objectTypeDef } =
      await client.ontologyProvider
        .getObjectDefinition(definition.apiName);
    return objectTypeDef as any;
  } else if (definition.type === "interface") {
    return client.ontologyProvider.getInterfaceDefinition(
      definition.apiName,
    ) as any;
  } else if (definition.type === "action") {
    return client.ontologyProvider.getActionDefinition(
      definition.unsanitizedApiName ?? definition.apiName,
    ) as any;
  } else if (definition.type === "query") {
    return client.ontologyProvider.getQueryDefinition(
      definition.apiName,
      definition.isFixedVersion ? definition.version : undefined,
    ) as any;
  } else {
    throw new Error("Not implemented for given definition");
  }
};
