/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon COACH architecture patterns.
 *
 *     Coach-advisor module for Pantheon (League of Legends assistant)
 *
 */

import type {
  ActionMetadata,
  InterfaceMetadata,
  ObjectMetadata,
  QueryMetadata,
} from "@shared/utils/coach-types";
import type { MinimalClient } from "../MinimalClientContext.js";

export const InterfaceDefinitions: unique symbol = Symbol(
  process.env.MODE !== "production" ? "InterfaceDefinitions" : undefined,
);

export interface FetchedObjectTypeDefinition extends ObjectMetadata {
  // we keep this here so we can depend on these synchronously
  [InterfaceDefinitions]: {
    [key: string]: { def: InterfaceMetadata };
  };
}

export interface GameStateProvider {
  /**
   * Returns the current known definition for the object.
   *
   * May result in multiple network calls. May cache results. May invalidate results
   * @param apiName
   * @returns
   */
  getObjectDefinition: (
    apiName: string,
  ) => Promise<FetchedObjectTypeDefinition>;

  /**
   * Returns the current known definition for the interface.
   *
   * May result in multiple network calls. May cache results. May invalidate results
   * @param apiName
   * @returns
   */
  getInterfaceDefinition: (
    apiName: string,
  ) => Promise<InterfaceMetadata>;

  getQueryDefinition: (
    apiName: string,
    version: string | undefined,
  ) => Promise<QueryMetadata>;

  getActionDefinition: (apiName: string) => Promise<ActionMetadata>;
}

export type OntologyProviderFactory<
  T extends GameStateProvider = GameStateProvider,
> = (
  client: MinimalClient,
) => T;
