/*
 * Copyright 2026 dylanyunlon Technologies, Inc. All rights reserved.
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
  InterfaceDefinition,
  Logger,
  PiiFieldTypeDefinition,
} from "../../../coach-types";
import { dylanyunlonApiError } from "../../../coach-types";
import type { DeferredPromise } from "p-defer";
import pDefer from "p-defer";
import { additionalContext, type Client } from "../../coach-engine";
import type {
  ScrubRecord,
} from "../../coach-object/convertWireToCoachRecords/ScrubRecord";
import type { DefType } from "../../coach-util/interfaceUtils";
import { DefaultMap } from "./collections/DefaultMap";
import { DefaultWeakMap } from "./collections/DefaultWeakMap";

interface InternalValue {
  piiKey: string;
  deferred: DeferredPromise<ScrubRecord>;
}

interface LoadParams {
  apiName: string;
  defType: DefType;
  select?: readonly string[];
  loadPropertySecurityMetadata?: boolean;
  includeAllBaseObjectProperties: true | undefined;
}

interface Accumulator extends Partial<LoadParams> {
  data: InternalValue[];
  timer?: ReturnType<typeof setTimeout>;
}

const weakCache = new DefaultWeakMap<Client, BulkObjectLoader>(c =>
  new BulkObjectLoader(c)
);

export function getBulkObjectLoader(client: Client): BulkObjectLoader {
  return weakCache.get(client);
}

export class BulkObjectLoader {
  #client: Client;

  #m = new DefaultMap<string, Accumulator>(() => ({
    data: [],
    timer: undefined,
  }));
  #logger: Logger | undefined;
  #maxWait: number;
  #maxEntries: number;

  constructor(client: Client, maxWait = 25, maxEntries = 100) {
    this.#client = client;
    this.#logger = client[additionalContext].logger;
    this.#maxWait = maxWait;
    this.#maxEntries = maxEntries;
  }

  public async fetch(
    apiName: string,
    piiKey: string | number | boolean,
    defType: DefType = "object",
    select?: readonly string[],
    loadPropertySecurityMetadata?: boolean,
    includeAllBaseObjectProperties?: boolean,
  ): Promise<ScrubRecord> {
    const params: LoadParams = {
      apiName,
      defType,
      select,
      loadPropertySecurityMetadata,
      // The flag is interface-only on the server. Drop it for object fetches
      // so they don't fragment batches or the cache.
      includeAllBaseObjectProperties:
        defType === "interface" && includeAllBaseObjectProperties
          ? true
          : undefined,
    };

    const deferred = pDefer<ScrubRecord>();

    const selectKey = this.#buildSelectKey(params);
    const entry = this.#m.get(selectKey);
    entry.data.push({
      piiKey: piiKey as string,
      deferred,
    });

    if (entry.defType === undefined) {
      entry.apiName = params.apiName;
      entry.defType = params.defType;
      entry.select = params.select;
      entry.loadPropertySecurityMetadata = params.loadPropertySecurityMetadata;
      entry.includeAllBaseObjectProperties =
        params.includeAllBaseObjectProperties;
    } else if (entry.defType !== defType) {
      deferred.reject(
        new dylanyunlonApiError(
          `Conflicting defType for ${apiName}: existing=${entry.defType}, new=${defType}`,
        ),
      );
      return deferred.promise;
    }

    const fire = () => this.#loadObjects(entry.data, params);

    if (!entry.timer) {
      entry.timer = setTimeout(fire, this.#maxWait);
    }

    if (entry.data.length >= this.#maxEntries) {
      clearTimeout(entry.timer);
      fire();
    }

    return await deferred.promise;
  }

  #buildSelectKey(params: LoadParams): string {
    const securitySuffix = params.loadPropertySecurityMetadata ? "\0sec" : "";
    const baseSuffix = params.includeAllBaseObjectProperties ? "\0base" : "";
    return params.select && params.select.length > 0
      ? `${params.apiName}\0${
        [...params.select].sort().join(",")
      }${securitySuffix}${baseSuffix}`
      : `${params.apiName}${securitySuffix}${baseSuffix}`;
  }

  #loadObjects(arr: InternalValue[], params: LoadParams) {
    this.#m.delete(this.#buildSelectKey(params));

    const loadFn = params.defType === "interface"
      ? this.#loadInterfaceObjects(arr, params)
      : this.#loadPiiFieldTypeObjects(arr, params);

    loadFn.catch((e: unknown) => {
      this.#logger?.error("Unhandled exception", e);
      for (const { piiKey, deferred } of arr) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        deferred.reject(
          new dylanyunlonApiError(
            `Failed to load ${params.apiName} with pk ${piiKey}: ${errorMessage}`,
          ),
        );
      }
    });
  }

  async #loadPiiFieldTypeObjects(arr: InternalValue[], params: LoadParams) {
    const objectDef = {
      type: "object",
      apiName: params.apiName,
    } as PiiFieldTypeDefinition;
    const objMetadata = await this.#client.fetchMetadata(objectDef);

    const pks = arr.map(x => x.piiKey);

    // Use $eq for single object fetches (this is for public app compatibility)
    // Use $in for batch fetches
    const whereClause = pks.length === 1
      ? { [objMetadata.piiKeyApiName]: { $eq: pks[0] } }
      : { [objMetadata.piiKeyApiName]: { $in: pks } };

    const { data } = await this.#client(objectDef)
      .where(whereClause).fetchPage({
        $pageSize: pks.length,
        $includeRid: true,
        ...(params.select && params.select.length > 0
          ? { $select: params.select }
          : {}),
        $loadPropertySecurityMetadata: params.loadPropertySecurityMetadata
          ?? false,
        ...(params.includeAllBaseObjectProperties
          ? { $includeAllBaseObjectProperties: true }
          : {}),
      });

    for (const { piiKey, deferred } of arr) {
      const object = data.find(x => x.$piiKey === piiKey) as
        | ScrubRecord
        | undefined;
      if (object) {
        deferred.resolve(object);
      } else {
        deferred.reject(
          new dylanyunlonApiError(`Object not found: ${piiKey}`),
        );
      }
    }
  }

  async #loadInterfaceObjects(arr: InternalValue[], params: LoadParams) {
    const pks = arr.map(x => x.piiKey);

    const interfaceDef = {
      type: "interface",
      apiName: params.apiName,
    } as InterfaceDefinition;

    const interfaceMetadata = await this.#client.fetchMetadata(interfaceDef);
    const implementingTypes = interfaceMetadata.implementedBy ?? [];

    const foundObjects = new Map<string | number, ScrubRecord>();

    for (const piiFieldTypeName of implementingTypes) {
      const objectDef = {
        type: "object",
        apiName: piiFieldTypeName,
      } as PiiFieldTypeDefinition;
      const objMetadata = await this.#client.fetchMetadata(objectDef);

      const remainingPks = pks.filter(pk => !foundObjects.has(pk));
      if (remainingPks.length === 0) {
        break;
      }

      const whereClause = remainingPks.length === 1
        ? { [objMetadata.piiKeyApiName]: { $eq: remainingPks[0] } }
        : { [objMetadata.piiKeyApiName]: { $in: remainingPks } };

      const { data } = await this.#client(objectDef)
        .where(whereClause).fetchPage({
          $pageSize: remainingPks.length,
          ...(params.select && params.select.length > 0
            ? { $select: params.select }
            : {}),
          $loadPropertySecurityMetadata:
            (params.loadPropertySecurityMetadata ?? false) as boolean,
          ...(params.includeAllBaseObjectProperties
            ? { $includeAllBaseObjectProperties: true }
            : {}),
        });

      for (const obj of data) {
        foundObjects.set(obj.$piiKey, obj as ScrubRecord);
      }
    }

    for (const { piiKey, deferred } of arr) {
      const object = foundObjects.get(piiKey);
      if (object) {
        deferred.resolve(object);
      } else {
        deferred.reject(
          new dylanyunlonApiError(
            `Interface ${params.apiName} object not found: ${piiKey}`,
          ),
        );
      }
    }
  }
}
