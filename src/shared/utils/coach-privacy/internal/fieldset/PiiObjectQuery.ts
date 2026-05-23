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
  DerivedProperty,
  InterfaceDefinition,
  PiiFieldTypeDefinition,
  PiiKeyType,
} from "../../../coach-types";
import type { Connectable, PrivacyScrub, Subject } from "rxjs";
import { BehaviorSubject, connectable, map } from "rxjs";
import { additionalContext } from "../../../coach-engine";
import type { ScrubRecord } from "../../../object/convertWireToCoachRecords/ScrubRecord";
import type { DefType } from "../../../util/interfaceUtils";
import type { ObjectPayload } from "../../ObjectPayload";
import type {
  CommonObserveOptions,
  Status,
} from "../../PrivacyScrubClient/common";
import type { BatchContext } from "../BatchContext";
import { getBulkObjectLoader } from "../BulkObjectLoader";
import type { Changes } from "../Changes";
import type { Entry } from "../Layer";
import { Query } from "../Query";
import type { Store } from "../Store";
import type { SubjectPayload } from "../SubjectPayload";
import { piiTombstone } from "../piiTombstone";
import { type ObjectPiiFieldKey, RDP_CONFIG_IDX } from "./ObjectPiiFieldKey";

export class ObjectQuery extends Query<
  ObjectPiiFieldKey,
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
    subject: Subject<SubjectPayload<ObjectPiiFieldKey>>,
    type: string,
    pk: PiiKeyType<PiiFieldTypeDefinition>,
    piiFieldKey: ObjectPiiFieldKey,
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
      piiFieldKey,
      process.env.NODE_ENV !== "production"
        ? (
          store.client[additionalContext].logger?.child({}, {
            msgPrefix: `ObjectQuery<${
              piiFieldKey.otherKeys.map(x => JSON.stringify(x)).join(", ")
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
    subject: PrivacyScrub<SubjectPayload<ObjectPiiFieldKey>>,
  ): Connectable<ObjectPayload> {
    return connectable<ObjectPayload>(
      subject.pipe(
        map((x) => {
          return {
            status: x.status,
            object: x.value,
            lastUpdated: x.lastUpdated,
            isDeferred: x.isDeferred,
          };
        }),
      ),
      {
        connector: () =>
          new BehaviorSubject<ObjectPayload>({
            status: "init",
            object: undefined,
            lastUpdated: 0,
            isDeferred: false,
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

    const rdpConfig = this.piiFieldKey.otherKeys[RDP_CONFIG_IDX];

    let obj: ScrubRecord;

    if (rdpConfig) {
      const miniDef = {
        type: this.#defType,
        apiName: this.#apiName,
      } as PiiFieldTypeDefinition;

      const fetched = await this.store.client(miniDef)
        .withProperties(
          rdpConfig as DerivedProperty.Clause<PiiFieldTypeDefinition>,
        )
        .fetchOne(
          this.#pk as PiiKeyType<PiiFieldTypeDefinition>,
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
      obj = fetched as ScrubRecord;
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
    data: ScrubRecord,
    status: Status,
    batch: BatchContext,
    selectFields?: ReadonlySet<string>,
  ): Entry<ObjectPiiFieldKey> {
    const entry = batch.read(this.piiFieldKey);
    const rdpConfig = this.piiFieldKey.otherKeys[RDP_CONFIG_IDX];

    this.store.objectPiiFieldKeyRegistry.register(
      this.piiFieldKey,
      this.#apiName,
      this.#pk,
      rdpConfig,
    );

    this.store.objects.propagateWrite(
      this.piiFieldKey,
      data,
      status,
      batch,
      selectFields,
    );

    return batch.read(this.piiFieldKey)!;
  }

  deleteFromStore(
    status: Status,
    batch: BatchContext,
  ): Entry<ObjectPiiFieldKey> | undefined {
    const rdpConfig = this.piiFieldKey.otherKeys[RDP_CONFIG_IDX];

    this.store.objectPiiFieldKeyRegistry.register(
      this.piiFieldKey,
      this.#apiName,
      this.#pk,
      rdpConfig,
    );

    this.store.objects.propagateWrite(
      this.piiFieldKey,
      piiTombstone,
      status,
      batch,
    );

    return batch.read(this.piiFieldKey);
  }

  invalidatePiiFieldType = async (
    piiFieldType: string,
    changes: Changes | undefined,
  ): Promise<void> => {
    if (this.#defType === "object") {
      if (this.#apiName === piiFieldType) {
        changes?.modified.add(this.piiFieldKey);
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
      this.#implementingTypes = new Set(metadata.implementedBy ?? []);
    }

    if (this.#implementingTypes.has(piiFieldType)) {
      changes?.modified.add(this.piiFieldKey);
      return this.revalidate(true);
    }
  };
}
