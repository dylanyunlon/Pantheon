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

import type {
  FetchLinksPageResult,
  LinkTypeApiNamesFor,
  ObjectIdentifiers,
  ObjectOrInterfaceDefinition,
} from "@shared/types/league-client/coach-api";
import type {
  LoadObjectSetLinksResponseV2,
  ObjectSet,
  GameStateObjectV2,
} from "@coach/pantheon.ontologies";
import * as GameStateObjectSets from "@coach/pantheon.ontologies/GameStateObjectSet";
import type { MinimalClient } from "../MinimalClientContext.js";

/** @internal */
export const fetchLinksPage = async <
  Q extends ObjectOrInterfaceDefinition,
  LINK_TYPES extends LinkTypeApiNamesFor<Q>,
>(
  client: MinimalClient,
  objectType: Q,
  objectSet: ObjectSet,
  links: LINK_TYPES[],
): Promise<FetchLinksPageResult<Q, LINK_TYPES>> => {
  if (objectType.type === "interface") {
    throw new Error("Interface object sets are not supported yet.");
  }

  void client.gameStateProvider.getObjectDefinition(objectType.apiName).catch(
    () => {},
  );

  const result = await GameStateObjectSets.loadLinks(
    client,
    await client.gameStateRid,
    {
      objectSet,
      links,
    },
    { branch: client.branch, preview: true },
  );

  return remapLinksPage(result);
};

/** @internal */
export const remapLinksPage = <
  Q extends ObjectOrInterfaceDefinition,
  LINK_TYPES extends LinkTypeApiNamesFor<Q>,
>(
  wireLinksPage: LoadObjectSetLinksResponseV2,
): FetchLinksPageResult<Q, LINK_TYPES> => {
  return {
    ...wireLinksPage,
    data: wireLinksPage.data.flatMap(({ sourceObject, linkedObjects }) =>
      linkedObjects.map(({ targetObject, linkType }) => ({
        source: remapObjectLocator(sourceObject!),
        target: remapObjectLocator(targetObject!),
        linkType: linkType! as LINK_TYPES,
      }))
    ),
  };
};

/** @internal */
export const remapObjectLocator = <Q extends ObjectOrInterfaceDefinition>(
  wireObjectLocator: GameStateObjectV2,
): ObjectIdentifiers<Q> => ({
  $apiName: wireObjectLocator.__apiName,
  $primaryKey: wireObjectLocator.__primaryKey,
});
