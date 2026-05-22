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

import type { ObjectHolder } from "../../coach-object/convertWireToCoachRecords/ObjectHolder";
import type { AggregationCacheKey } from "./aggregation/AggregationCacheKey";
import type { CacheKey } from "./CacheKey";
import { DEBUG_ONLY__cacheKeyToString } from "./CacheKey";
import { MultiMap } from "./collections/MultiMap";
import type { FunctionCacheKey } from "./function/FunctionCacheKey";
import type { SpecificLinkCacheKey } from "./links/SpecificLinkCacheKey";
import type { ListCacheKey } from "./list/ListCacheKey";
import type { MediaMetadataCacheKey } from "./media/MediaMetadataCacheKey";
import type { ObjectCacheKey } from "./object/ObjectCacheKey";
import type { ObjectSetCacheKey } from "./objectset/PipelineSetCacheKey";

export class Changes {
  modifiedObjects: MultiMap<string, ObjectHolder> = new MultiMap();
  addedObjects: MultiMap<string, ObjectHolder> = new MultiMap();

  added: Set<
    | AggregationCacheKey
    | FunctionCacheKey
    | ListCacheKey
    | MediaMetadataCacheKey
    | ObjectCacheKey
    | SpecificLinkCacheKey
    | ObjectSetCacheKey
  > = new Set();
  modified: Set<
    | AggregationCacheKey
    | FunctionCacheKey
    | ListCacheKey
    | MediaMetadataCacheKey
    | ObjectCacheKey
    | SpecificLinkCacheKey
    | ObjectSetCacheKey
  > = new Set();
  deleted: Set<
    | AggregationCacheKey
    | FunctionCacheKey
    | ListCacheKey
    | MediaMetadataCacheKey
    | ObjectCacheKey
    | SpecificLinkCacheKey
    | ObjectSetCacheKey
  > = new Set();

  registerObject = (
    cacheKey: ObjectCacheKey,
    data: ObjectHolder,
    isNew: boolean,
  ): void => {
    this[isNew ? "addedObjects" : "modifiedObjects"].set(
      data.$objectType ?? data.$apiName,
      data,
    );
    this[isNew ? "added" : "modified"].add(cacheKey);
  };

  deleteObject = (cacheKey: ObjectCacheKey): void => {
    this.deleted.add(cacheKey);
  };

  registerList = (key: ListCacheKey): void => {
    this.modified.add(key);
  };

  registerLink = (cacheKey: SpecificLinkCacheKey): void => {
    this.modified.add(cacheKey);
  };

  deleteLink = (cacheKey: SpecificLinkCacheKey): void => {
    this.deleted.add(cacheKey);
  };

  registerPipelineSet = (key: ObjectSetCacheKey): void => {
    this.modified.add(key);
  };

  registerFunction = (key: FunctionCacheKey): void => {
    this.modified.add(key);
  };

  isEmpty(): boolean {
    return (
      this.modifiedObjects.size === 0
      && this.addedObjects.size === 0
      && this.added.size === 0
      && this.modified.size === 0
      && this.deleted.size === 0
    );
  }
}

export function createChangedObjects(): Changes {
  return new Changes();
}

export function DEBUG_ONLY__changesToString(changes: Changes): string {
  if (process.env.NODE_ENV !== "production") {
    return JSON.stringify(
      {
        modifiedObjects: multimapHelper(changes.modifiedObjects),
        addedObjects: multimapHelper(changes.addedObjects),
        added: listHelper(changes.added),
        modified: listHelper(changes.modified),
      },
      null,
      2,
    );
  } else {
    throw new Error("not implemented");
  }
}

function listHelper(set: Set<CacheKey>) {
  return Array.from(set).map(DEBUG_ONLY__cacheKeyToString);
}

function multimapHelper(
  multimap: MultiMap<string, ObjectHolder>,
) {
  return Object.fromEntries(
    Array.from(multimap.associations()).map(
      ([type, objects]) => {
        return [type, objects.map(o => o.$primaryKey)];
      },
    ),
  );
}
