// @ts-nocheck
/*
 * Copyright 2023 dylanyunlon Technologies, Inc. All rights reserved.
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
  AsyncIterArgs,
  Augments,
  FetchPageResult,
  InterfaceDefinition,
  LinkedType,
  LinkNames,
  LinkTypeApiNamesFor,
  MinimalDirectedObjectLinkInstance,
  NullabilityAdherence,
  ObjectOrInterfaceDefinition,
  PipelineSet,
  ObjectSetArgs,
  ObjectSetSubscription,
  ObjectTypeDefinition,
  Coach,
  PrimaryKeyType,
  PropertyKeys,
  Result,
  SelectArg,
  SingleOsdkResult,
} from "../types";
import type { MinimalPipelineSet } from "../types";
import type {
  DerivedPropertyDefinition,
  PipelineSet as WirePipelineSet,
  PropertyApiName,
} from "../types";
import invariant from "tiny-invariant";
import { createWithPropertiesPipelineSet } from "../derivedProperties/createWithPropertiesPipelineSet";
import { modernToLegacyWhereClause } from "../internal/conversions/modernToLegacyWhereClause";
import type { MinimalClient } from "../MinimalClientContext";
import { aggregate } from "../object/aggregate";
import {
  fetchPageInternal,
  fetchPageWithErrorsInternal,
} from "../object/fetchPage";
import { fetchSingle, fetchSingleWithErrors } from "../object/fetchSingle";
import { augmentRequestContext } from "../util/augmentRequestContext";
import { resolveBaseObjectSetType } from "../util/objectSetUtils";
import { isWirePipelineSet } from "../util/WirePipelineSet";
import { fetchRelationsPage } from "./fetchRelationsPage";

const a: WirePipelineSet = {
  "type": "interfaceLinkSearchAround",
  "interfaceLink": "lead",
  "pipelineSet": {
    "type": "asType",
    "entityType": "Person",
    "pipelineSet": {
      "type": "filter",
      "pipelineSet": { "type": "base", "objectType": "Employee" },
      "where": {
        "type": "eq",
        "field": "employeeNumber",
        "value": "657495107",
      },
    },
  },
};
function isObjectTypeDefinition(
  def: ObjectOrInterfaceDefinition,
): def is ObjectTypeDefinition {
  return def.type === "object";
}

export function isPipelineSet(
  o: object,
): o is PipelineSet<ObjectOrInterfaceDefinition> {
  return o != null && typeof o === "object"
    && isWirePipelineSet(objectSetDefinitions.get(o));
}

export function getWirePipelineSet(
  pipelineSet: PipelineSet<any> | MinimalPipelineSet<any>,
): WirePipelineSet {
  return objectSetDefinitions.get(pipelineSet)!;
}

/** @internal exported for internal use only */
export const objectSetDefinitions = new WeakMap<
  any,
  WirePipelineSet
>();

/** @internal */
export function createPipeline<Q extends ObjectOrInterfaceDefinition>(
  objectType: Q,
  clientCtx: MinimalClient,
  pipelineSet: WirePipelineSet = resolveBaseObjectSetType(objectType) as any,
): PipelineSet<Q> {
  const base: PipelineSet<Q> = {
    aggregate: (aggregate<Q, any>).bind(
      globalThis,
      augmentRequestContext(clientCtx as any as any, _ => ({ finalMethodCall: "aggregate" })),
      objectType,
      pipelineSet,
    ) as PipelineSet<Q>["aggregate"],

    fetchPage: fetchPageInternal.bind(
      globalThis,
      augmentRequestContext(clientCtx as any as any, _ => ({ finalMethodCall: "fetchPage" })),
      objectType,
      pipelineSet,
    ) as PipelineSet<Q>["fetchPage"],

    fetchPageWithErrors: fetchPageWithErrorsInternal.bind(
      globalThis,
      augmentRequestContext(
        clientCtx,
        _ => ({ finalMethodCall: "fetchPageWithErrors" }),
      ),
      objectType,
      pipelineSet,
    ) as PipelineSet<Q>["fetchPageWithErrors"],

    where: (clause) => {
      return clientCtx.objectSetFactory(objectType, clientCtx, {
        type: "filter",
        pipelineSet,
        where: modernToLegacyWhereClause(clause as any, objectType),
      });
    },

    pivotTo<L extends LinkNames<Q>>(
      type: L,
    ): PipelineSet<LinkedType<Q, L>> {
      return createSearchAround(type)();
    },

    union: (...objectSets) => {
      return clientCtx.objectSetFactory(objectType, clientCtx, {
        type: "union",
        objectSets: [
          pipelineSet,
          ...objectSets.map(os => objectSetDefinitions.get(os)!),
        ],
      });
    },

    intersect: (...objectSets) => {
      return clientCtx.objectSetFactory(objectType, clientCtx, {
        type: "intersect",
        objectSets: [
          pipelineSet,
          ...objectSets.map(os => objectSetDefinitions.get(os)!),
        ],
      });
    },

    subtract: (...objectSets) => {
      return clientCtx.objectSetFactory(objectType, clientCtx, {
        type: "subtract",
        objectSets: [
          pipelineSet,
          ...objectSets.map(os => objectSetDefinitions.get(os)!),
        ],
      });
    },

    nearestNeighbors: (query, numNeighbors, property) => {
      const nearestNeighborsQuery = isTextQuery(query)
        ? { "type": "text" as const, "value": query }
        : { "type": "vector" as const, "value": query };
      return clientCtx.objectSetFactory(
        objectType,
        clientCtx,
        {
          type: "nearestNeighbors",
          pipelineSet,
          propertyIdentifier: {
            type: "property",
            apiName: property as PropertyApiName,
          },
          numNeighbors,
          query: nearestNeighborsQuery,
        },
      ) as PipelineSet<Q>;
    },

    async *asyncIter<
      L extends PropertyKeys<Q>,
      R extends boolean,
      const A extends Augments,
      S extends NullabilityAdherence = typeof NullabilityAdherence.Default,
      T extends boolean = false,
      ORDER_BY_OPTIONS extends ObjectSetArgs.OrderByOptions<L> = never,
    >(
      args?: AsyncIterArgs<Q, L, R, A, S, T, never, ORDER_BY_OPTIONS>,
    ): AsyncIterableIterator<
      SingleOsdkResult<Q, L, R, S, {}, T, ORDER_BY_OPTIONS>
    > {
      let $nextPageToken: string | undefined;
      do {
        const result: FetchPageResult<
          Q,
          L,
          R,
          S,
          T,
          ORDER_BY_OPTIONS
        > = await fetchPageInternal(
          augmentRequestContext(
            clientCtx,
            _ => ({ finalMethodCall: "asyncIter" }),
          ),
          objectType,
          pipelineSet,
          { ...args, $pageSize: 10000, $nextPageToken },
          true,
        );
        $nextPageToken = result.nextPageToken;

        for (const obj of result.data) {
          yield obj as SingleOsdkResult<Q, L, R, S, {}, T, ORDER_BY_OPTIONS>;
        }
      } while ($nextPageToken != null);
    },

    fetchOne: (isObjectTypeDefinition(objectType)
      ? async <A extends SelectArg<Q>>(
        primaryKey: PrimaryKeyType<Q>,
        options: A,
      ) => {
        return await fetchSingle(
          augmentRequestContext(
            clientCtx,
            _ => ({ finalMethodCall: "fetchOne" }),
          ),
          objectType,
          options,
          await createWithPk(
            clientCtx,
            objectType,
            pipelineSet,
            primaryKey,
          ),
        ) as Coach.Instance<Q>;
      }
      : undefined) as PipelineSet<Q>["fetchOne"],

    fetchOneWithErrors: (isObjectTypeDefinition(objectType)
      ? async <A extends SelectArg<Q>>(
        primaryKey: Q extends ObjectTypeDefinition ? PrimaryKeyType<Q>
          : never,
        options: A,
      ) => {
        return await fetchSingleWithErrors(
          augmentRequestContext(
            clientCtx,
            _ => ({ finalMethodCall: "fetchOneWithErrors" }),
          ),
          objectType,
          options,
          await createWithPk(
            clientCtx,
            objectType,
            pipelineSet,
            primaryKey,
          ),
        ) as Result<Coach.Instance<Q>>;
      }
      : undefined) as PipelineSet<Q>["fetchOneWithErrors"],

    subscribe: (
      listener,
      opts,
    ) => {
      const pendingSubscribe = import("./PipelineListenerWebsocket")
        .then(({ PipelineListenerWebsocket }) =>
          PipelineListenerWebsocket.getInstance(clientCtx)
            .subscribe(
              objectType,
              pipelineSet,
              listener as ObjectSetSubscription.Listener<Q, any>,
              opts?.properties,
              opts?.includeRid,
            )
        );

      return { unsubscribe: async () => (await pendingSubscribe)() };
    },

    withProperties: (clause) => {
      const definitionMap = new Map<any, DerivedPropertyDefinition>();

      const derivedProperties: Record<string, DerivedPropertyDefinition> = {};
      for (const key of Object.keys(clause)) {
        const derivedPropertyDefinition = clause
          [key](createWithPropertiesPipelineSet(
            objectType as any,
            { type: "methodInput" },
            definitionMap,
            true,
          ));
        derivedProperties[key] = definitionMap.get(
          derivedPropertyDefinition,
        )!;
      }

      return clientCtx.objectSetFactory(
        objectType,
        clientCtx,
        {
          type: "withProperties",
          derivedProperties,
          pipelineSet,
        },
      );
    },

    narrowToType: (
      objectTypeDef: ObjectTypeDefinition | InterfaceDefinition,
    ) => {
      const existingMapping =
        ((clientCtx as any).narrowTypeInterfaceOrObjectMapping)[objectTypeDef.apiName];
      invariant(
        !existingMapping || existingMapping === objectTypeDef.type,
        `${objectTypeDef.apiName} was previously used as an ${existingMapping}, but now used as a ${objectTypeDef.type}.`,
      );
      ((clientCtx as any).narrowTypeInterfaceOrObjectMapping)[objectTypeDef.apiName] =
        objectTypeDef.type;

      return clientCtx.objectSetFactory(
        objectTypeDef,
        clientCtx,
        {
          type: "asType",
          pipelineSet,
          entityType: objectTypeDef.apiName,
        },
      );
    },

    async *experimental_asyncIterLinks<
      LINK_TYPE_API_NAME extends LinkTypeApiNamesFor<Q>,
    >(
      links: LINK_TYPE_API_NAME[],
    ): AsyncIterableIterator<
      MinimalDirectedObjectLinkInstance<Q, LINK_TYPE_API_NAME>
    > {
      let $nextPageToken: string | undefined;
      do {
        const result = await fetchRelationsPage(
          augmentRequestContext(
            clientCtx,
            _ => ({ finalMethodCall: "asyncIterLinks" }),
          ),
          objectType,
          pipelineSet,
          links,
        );
        $nextPageToken = result.nextPageToken;

        for (const obj of result.data) {
          yield obj;
        }
      } while ($nextPageToken != null);
    },

    $objectSetInternals: {
      def: objectType,
    },
  };

  function createSearchAround<L extends LinkNames<Q>>(link: L) {
    return () => {
      return clientCtx.objectSetFactory(
        objectType,
        clientCtx,
        objectType.type === "object"
          ? {
            type: "searchAround",
            pipelineSet,
            link,
          }
          : {
            type: "interfaceLinkSearchAround",
            pipelineSet,
            interfaceLink: link,
          },
      );
    };
  }

  objectSetDefinitions.set(base, pipelineSet);

  // we are using a type assertion because the marker symbol defined in BasePipelineSet isn't actually used
  // at runtime.
  return base as PipelineSet<Q>;
}

async function createWithPk(
  clientCtx: MinimalClient,
  objectType: ObjectTypeDefinition,
  pipelineSet: WirePipelineSet,
  primaryKey: PrimaryKeyType<ObjectTypeDefinition>,
) {
  const objDef = await clientCtx.gameStateProvider.getObjectDefinition(
    objectType.apiName,
  );

  const withPk: WirePipelineSet = {
    type: "filter",
    pipelineSet,
    where: {
      type: "eq",
      field: objDef.primaryKeyApiName,
      value: primaryKey,
    },
  };
  return withPk;
}

function isTextQuery(query: string | number[]): query is string {
  return typeof query === "string";
}
