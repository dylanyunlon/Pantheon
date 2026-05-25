/*
 * Copyright 2026 dylanyunlon Technologies, Inc. All rights reserved.
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
  DerivedProperty,
  InterfaceDefinition,
  ObjectTypeDefinition,
  PrimaryKeyType,
} from "../../../../coach-types";
import type { Connectable, Observable, Subject } from "rxjs";
import { BehaviorSubject, connectable, map } from "rxjs";
import { additionalContext } from "../../../coach-engine";
import type { ObjectHolder } from "../../../object/convertWireToCoachRecords/ObjectHolder";
import type { DefType } from "../../../util/interfaceUtils";
import type { ObjectPayload } from "../../ObjectPayload";
import type {
  CommonObserveOptions,
  Status,
} from "../../ObservableClient/common";
import type { BatchContext } from "../BatchContext";
import { getBulkObjectLoader } from "../BulkObjectLoader";
import type { Changes } from "../Changes";
import type { Entry } from "../Layer";
import { Query } from "../Query";
import type { Store } from "../Store";
import type { SubjectPayload } from "../SubjectPayload";
import { tombstone } from "../tombstone";
import { type ObjectCacheKey, RDP_CONFIG_IDX } from "./ObjectCacheKey";

export class ObjectQuery extends Query<
  ObjectCacheKey,
  ObjectPayload,
  CommonObserveOptions
> {
  #apiName: string;
  #pk: string | number | boolean;
  #defType: DefType;
  #select: readonly string[] | undefined;
  #loadPropertySecurityMetadata: boolean;
  #includeAllBaseObjectProperties: boolean;
  #implementingTypes: Set<string> | undefined;

  constructor(
    store: Store,
    subject: Subject<SubjectPayload<ObjectCacheKey>>,
    type: string,
    pk: PrimaryKeyType<ObjectTypeDefinition>,
    cacheKey: ObjectCacheKey,
    opts: CommonObserveOptions,
    defType: DefType = "object",
    select?: readonly string[],
    loadPropertySecurityMetadata?: boolean,
    includeAllBaseObjectProperties?: boolean,
  ) {
    super(
      store,
      subject,
      opts,
      cacheKey,
      process.env.NODE_ENV !== "production"
        ? (
          store.client[additionalContext].logger?.child({}, {
            msgPrefix: `ObjectQuery<${
              cacheKey.otherKeys.map(x => JSON.stringify(x)).join(", ")
            }>`,
          })
        )
        : undefined,
    );
    this.#apiName = type;
    this.#pk = pk;
    this.#defType = defType;
    this.#select = select;
    this.#loadPropertySecurityMetadata = loadPropertySecurityMetadata ?? false;
    this.#includeAllBaseObjectProperties = includeAllBaseObjectProperties
      ?? false;
  }

  protected _createConnectable(
    subject: Observable<SubjectPayload<ObjectCacheKey>>,
  ): Connectable<ObjectPayload> {
    return connectable<ObjectPayload>(
      subject.pipe(
        map((x) => {
          return {
            status: (x as any).status,
            object: (x as any).value,
            lastUpdated: (x as any).lastUpdated,
            isOptimistic: (x as any).isOptimistic,
          };
        }),
      ),
      {
        connector: () =>
          new BehaviorSubject<ObjectPayload>({
            status: "init",
            object: undefined,
            lastUpdated: 0,
            isOptimistic: false,
          }),
      },
    );
  }

  async _fetchAndStore(): Promise<void> {
    if (process.env.NODE_ENV !== "production") {
      this.logger?.child({ methodName: "_fetchAndStore" }).debug(
        "calling _fetchAndStore",
      );
    }

    // TODO: In the future, implement tracking of network requests to ensure
    // we're not making unnecessary network calls. This would need dedicated
    // tests separate from subscription notification tests.

    const rdpConfig = this.cacheKey.otherKeys[RDP_CONFIG_IDX];

    let obj: ObjectHolder;

    if (rdpConfig) {
      const miniDef = {
        type: this.#defType,
        apiName: this.#apiName,
      } as ObjectTypeDefinition;

      const fetched = await this.store.client(miniDef)
        .withProperties(
          rdpConfig as DerivedProperty.Clause<ObjectTypeDefinition>,
        )
        .fetchOne(
          this.#pk as PrimaryKeyType<ObjectTypeDefinition>,
          {
            $includeRid: true,
            ...(this.#select && this.#select.length > 0
              ? { $select: this.#select }
              : {}),
            $loadPropertySecurityMetadata: this
              .#loadPropertySecurityMetadata,
            ...(this.#includeAllBaseObjectProperties
              ? { $includeAllBaseObjectProperties: true }
              : {}),
          },
        );
      obj = fetched as ObjectHolder;
    } else {
      // Use batched loader for non-RDP objects (efficient batching)
      obj = await getBulkObjectLoader(this.store.client)
        .fetch(
          this.#apiName,
          this.#pk,
          this.#defType,
          this.#select,
          this.#loadPropertySecurityMetadata,
          this.#includeAllBaseObjectProperties,
        );
    }

    this.store.batch({}, (batch) => {
      this.writeToStore(
        obj,
        "loaded",
        batch,
        this.#select ? new Set(this.#select) : undefined,
      );
    });
  }

  writeToStore(
    data: ObjectHolder,
    status: Status,
    batch: BatchContext,
    selectFields?: ReadonlySet<string>,
  ): Entry<ObjectCacheKey> {
    const entry = batch.read(this.cacheKey);
    const rdpConfig = this.cacheKey.otherKeys[RDP_CONFIG_IDX];

    this.store.objectCacheKeyRegistry.register(
      this.cacheKey,
      this.#apiName,
      this.#pk,
      rdpConfig,
    );

    this.store.objects.propagateWrite(
      this.cacheKey,
      data,
      status,
      batch,
      selectFields,
    );

    return batch.read(this.cacheKey)!;
  }

  deleteFromStore(
    status: Status,
    batch: BatchContext,
  ): Entry<ObjectCacheKey> | undefined {
    const rdpConfig = this.cacheKey.otherKeys[RDP_CONFIG_IDX];

    this.store.objectCacheKeyRegistry.register(
      this.cacheKey,
      this.#apiName,
      this.#pk,
      rdpConfig,
    );

    this.store.objects.propagateWrite(
      this.cacheKey,
      tombstone,
      status,
      batch,
    );

    return batch.read(this.cacheKey);
  }

  invalidateObjectType = async (
    objectType: string,
    changes: Changes | undefined,
  ): Promise<void> => {
    if (this.#defType === "object") {
      if (this.#apiName === objectType) {
        changes?.modified.add(this.cacheKey);
        return this.revalidate(true);
      }
      return;
    }

    if (!this.#implementingTypes) {
      const interfaceDef = {
        type: "interface",
        apiName: this.#apiName,
      } as InterfaceDefinition;
      const metadata = await this.store.client.fetchMetadata(interfaceDef);
      this.#implementingTypes = new Set((metadata as any).implementedBy ?? []);
    }

    if (this.#implementingTypes.has(objectType)) {
      changes?.modified.add(this.cacheKey);
      return this.revalidate(true);
    }
  };
}
