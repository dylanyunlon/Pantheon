import type {
  ActionDefinition,
  InterfaceMetadata,
  QueryDefinition
} from '../types'
import type { MinimalPantheonClient } from '../client/MinimalPantheonClientContext'
import { createAsyncClientCache } from '../object/Cache'
import { deepFreeze } from '../util/deepFreeze'
import { loadActionMetadata } from './loadActionMetadata'
import { loadFullObjectMetadata } from './loadFullObjectMetadata'
import { loadInterfaceMetadata } from './loadInterfaceMetadata'
import { loadQueryMetadata } from './loadQueryMetadata'
import {
  type FetchedObjectTypeDefinition,
  InterfaceDefinitions,
  type GameStateProviderFactory
} from './GameStateProvider'

export interface GameStateCachingOptions {
  logger?: { info(...args: unknown[]): void }
}

export const createStandardGameStateProviderFactory: (
  opts: GameStateCachingOptions
) => GameStateProviderFactory = (_opts) => {
  return (client) => {
    async function loadObject(
      client: MinimalPantheonClient,
      key: string
    ): Promise<FetchedObjectTypeDefinition> {
      const objectDef = await loadFullObjectMetadata(client, key)
      const interfaceDefs = Object.fromEntries<{ def: InterfaceMetadata }>(
        (
          await Promise.all<InterfaceMetadata>(
            (objectDef as any).implements?.map((i: string) =>
              ret.getInterfaceDefinition(i)
            ) ?? []
          )
        ).map((i) => [i.apiName, { def: i }])
      )

      const fullObjectDef = {
        ...objectDef,
        [InterfaceDefinitions]: interfaceDefs
      }

      return deepFreeze(fullObjectDef) as FetchedObjectTypeDefinition
    }

    async function loadInterface(
      client: MinimalPantheonClient,
      key: string
    ) {
      return deepFreeze(await loadInterfaceMetadata(client, key)) as InterfaceMetadata
    }

    async function loadQuery(client: MinimalPantheonClient, key: string) {
      return loadQueryMetadata(client, key)
    }

    async function loadAction(client: MinimalPantheonClient, key: string) {
      return loadActionMetadata(client, key)
    }

    function makeGetter<N extends {}>(
      fn: (client: MinimalPantheonClient, key: string) => Promise<N>
    ) {
      const cache = createAsyncClientCache<string, N>((c, key) => fn(c, key))
      return async (apiName: string) => {
        return await cache.get(client, apiName)
      }
    }

    function makeQueryGetter(
      client: MinimalPantheonClient,
      fn: (client: MinimalPantheonClient, key: string) => Promise<QueryDefinition>
    ) {
      const queryCache = createAsyncClientCache<string, QueryDefinition>(
        (c, key) => fn(c, key)
      )
      return async (apiName: string, version?: string) => {
        const key = version ? `${apiName}:${version}` : apiName
        return await queryCache.get(client, key)
      }
    }

    const ret = {
      getObjectDefinition: makeGetter(loadObject),
      getInterfaceDefinition: makeGetter(loadInterface),
      getActionDefinition: makeGetter(loadAction),
      getQueryDefinition: makeQueryGetter(client, loadQuery)
    }
    return ret
  }
}

export type StandardGameStateProvider = any
