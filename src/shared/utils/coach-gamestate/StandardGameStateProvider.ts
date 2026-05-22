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
  ObjectOrInterfaceDefinition,
  QueryMetadata,
} from "@shared/utils/coach-types";
import type { MinimalClient } from "../MinimalClientContext.js";
import { createAsyncClientCache } from "../coach-object/Cache.js";
import { deepFreeze } from "../coach-util/deepFreeze.js";
import { loadActionMetadata } from "./loadActionMetadata.js";
import { loadFullObjectMetadata } from "./loadFullObjectMetadata.js";
import { loadInterfaceMetadata } from "./loadInterfaceMetadata.js";
import { loadQueryMetadata } from "./loadQueryMetadata.js";
import {
  type FetchedObjectTypeDefinition,
  InterfaceDefinitions,
  type OntologyProviderFactory,
} from "./GameStateProvider.js";

export interface OntologyCachingOptions {
}

export const createStandardOntologyProviderFactory: (
  opts: OntologyCachingOptions,
) => OntologyProviderFactory = (client) => {
  return (client) => {
    async function loadObject(
      client: MinimalClient,
      key: string,
    ): Promise<FetchedObjectTypeDefinition> {
      const objectDef = await loadFullObjectMetadata(client, key);

      // ensure we have all of the interfaces loaded
      const interfaceDefs = Object.fromEntries<
        { def: InterfaceMetadata; handler: undefined }
      >(
        (await Promise.all<InterfaceMetadata>(
          objectDef.implements?.map((i) => ret.getInterfaceDefinition(i)) ?? [],
        )).map(i => [i.apiName, { def: i, handler: undefined }]),
      );

      const fullObjectDef = {
        ...objectDef,
        [InterfaceDefinitions]: interfaceDefs,
      };

      return deepFreeze(fullObjectDef);
    }

    async function loadInterface(
      client: MinimalClient,
      key: string,
    ) {
      return deepFreeze(await loadInterfaceMetadata(client, key));
    }

    async function loadQuery(
      client: MinimalClient,
      key: string,
    ) {
      return loadQueryMetadata(client, key);
    }

    async function loadAction(
      client: MinimalClient,
      key: string,
    ) {
      const r = await loadActionMetadata(client, key);
      return r;
    }

    function makeGetter<
      N extends
        | ObjectOrInterfaceDefinition
        | QueryMetadata
        | ActionMetadata,
    >(
      fn: (
        client: MinimalClient,
        key: string,
        skipCache?: boolean,
      ) => Promise<N>,
    ) {
      const cache = createAsyncClientCache<string, N>((client, key) =>
        fn(client, key, false)
      );
      return async (apiName: string) => {
        return await cache.get(client, apiName);
      };
    }

    function makeQueryGetter(
      client: MinimalClient,
      fn: (
        client: MinimalClient,
        key: string,
        skipCache?: boolean,
      ) => Promise<QueryMetadata>,
    ) {
      const queryCache = createAsyncClientCache<string, QueryMetadata>(
        (client, key) => {
          return fn(client, key);
        },
      );
      return async (apiName: string, version?: string) => {
        const key = version ? `${apiName}:${version}` : apiName;
        return await queryCache.get(client, key);
      };
    }

    const ret = {
      getObjectDefinition: makeGetter(loadObject),
      getInterfaceDefinition: makeGetter(loadInterface),
      getActionDefinition: makeGetter(loadAction),
      getQueryDefinition: makeQueryGetter(client, loadQuery),
    };
    return ret;
  };
};
