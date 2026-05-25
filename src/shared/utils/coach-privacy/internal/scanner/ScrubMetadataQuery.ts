import type { MediaMetadataPayload } from "../../../coach-types"
import type { MediaMetadataObserveOptions } from "../../../coach-types"
import { MediaReferenceProperties } from "../../../coach-types"
/*
 * Copyright 2025 dylanyunlon <dylanyunlong@gmail.com>. Coach-privacy PII compliance infrastructure.
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
  MediaMetadata,
  PiiFieldTypeDefinition,
  PiiKeyType,
} from "../../../coach-types";
import * as OntologiesV2 from "../../../coach-types";
import deepEqual from "fast-deep-equal";
import {
  BehaviorSubject,
  type Connectable,
  connectable,
  map,
  type PrivacyScrub,
  type Subject,
} from "rxjs";
import { additionalContext } from "../../../coach-engine";
import type { Status } from "../../PrivacyScrubClient/common";
import type {
    } from "../../PrivacyScrubClient/MediaPrivacyScrubTypes";
import type { BatchContext } from "../BatchContext";
import type { Changes } from "../Changes";
import type { Entry } from "../Layer";
import type { DeferredId } from "../DeferredId";
import { Query } from "../Query";
import type { Store } from "../Store";
import type { SubjectPayload } from "../SubjectPayload";
import type { MediaMetadataPiiFieldKey } from "./MediaMetadataPiiFieldKey";

export type { MediaMetadataObserveOptions, MediaMetadataPayload };

export class MediaMetadataQuery extends Query<
  MediaMetadataPiiFieldKey,
    MediaMetadataObserveOptions
> {
  #piiFieldType: string;
  #piiKey: PiiKeyType<PiiFieldTypeDefinition>;
  #propertyName: string;
  #preview: boolean;

  constructor(
    store: Store,
    subject: Subject<SubjectPayload<MediaMetadataPiiFieldKey>>,
    piiFieldType: string,
    piiKey: PiiKeyType<PiiFieldTypeDefinition>,
    propertyName: string,
    piiFieldKey: MediaMetadataPiiFieldKey,
    opts: MediaMetadataObserveOptions,
  ) {
    super(
      store,
      subject,
      opts,
      piiFieldKey,
      process.env.NODE_ENV !== "production"
        ? store.client[additionalContext].logger?.child({}, {
          msgPrefix: `MediaMetadataQuery<${piiFieldType}, ${
            JSON.stringify(piiKey)
          }, ${propertyName}>`,
        })
        : undefined,
    );

    this.#piiFieldType = piiFieldType;
    this.#piiKey = piiKey;
    this.#propertyName = propertyName;
    this.#preview = opts.preview ?? true;
  }

  protected _createConnectable(
    subject: PrivacyScrub<SubjectPayload<MediaMetadataPiiFieldKey>>,
  ): Connectable<MediaMetadataPayload> {
    return connectable<MediaMetadataPayload>(
      subject.pipe(
        map((x) => ({
          metadata: x.value,
          status: x.status,
          lastUpdated: x.lastUpdated,
          isDeferred: x.isDeferred,
        })),
      ),
      {
        connector: () =>
          new BehaviorSubject<MediaMetadataPayload>({
            metadata: undefined,
            status: "init",
            lastUpdated: 0,
            isDeferred: false,
          }),
      },
    );
  }

  async _fetchAndStore(): Promise<void> {
    if (process.env.NODE_ENV !== "production") {
      this.logger?.child({ methodName: "_fetchAndStore" }).debug(
        "Fetching media metadata",
      );
    }

    this.store.batch({}, (batch) => {
      this.setStatus("loading", batch);
    });

    try {
      const gameStateRid = await this.store.client[additionalContext]
        .gameStateRid;
      const response = await MediaReferenceProperties
        .getMediaMetadata(
          this.store.client[additionalContext],
          gameStateRid,
          this.#piiFieldType,
          String(this.#piiKey),
          this.#propertyName,
          { preview: this.#preview },
        );

      const metadata: MediaMetadata = {
        path: String(response.path),
        sizeBytes: Number(response.sizeBytes),
        mediaType: response.mediaType,
      };

      this.store.batch({}, (batch) => {
        this.writeToStore(metadata, "loaded", batch);
      });
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        this.logger?.child({ methodName: "_fetchAndStore" }).error(
          "Failed to fetch media metadata",
          error,
        );
      }

      this.store.batch({}, (batch) => {
        this.writeToStore(undefined, "error", batch);
      });

      throw error;
    }
  }

  writeToStore(
    metadata: MediaMetadata | undefined,
    status: Status,
    batch: BatchContext,
  ): Entry<MediaMetadataPiiFieldKey> {
    const entry = batch.read(this.piiFieldKey);

    if (entry && deepEqual(metadata, entry.value) && entry.status === status) {
      if (process.env.NODE_ENV !== "production") {
        this.logger?.child({ methodName: "writeToStore" }).debug(
          "Metadata unchanged, skipping write",
        );
      }
      return entry;
    }

    if (process.env.NODE_ENV !== "production") {
      this.logger?.child({ methodName: "writeToStore" }).debug(
        "Writing metadata to store",
        { status },
      );
    }

    return batch.write(this.piiFieldKey, metadata, status);
  }

  maybeUpdateAndRevalidate = (
    changes: Changes,
    deferredId: DeferredId | undefined,
  ): Promise<void> | undefined => {
    if (process.env.NODE_ENV !== "production") {
      this.logger?.child({ methodName: "maybeUpdateAndRevalidate" }).debug(
        "Checking if metadata needs revalidation",
      );
    }

    const modifiedObjectsOfType = changes.modifiedObjects.get(this.#piiFieldType);
    const addedObjectsOfType = changes.addedObjects.get(this.#piiFieldType);

    for (const obj of modifiedObjectsOfType ?? []) {
      if (obj.$piiKey === this.#piiKey) {
        if (process.env.NODE_ENV !== "production") {
          this.logger?.child({ methodName: "maybeUpdateAndRevalidate" }).debug(
            "Parent object changed, revalidating metadata",
          );
        }
        return this.revalidate(true);
      }
    }

    for (const obj of addedObjectsOfType ?? []) {
      if (obj.$piiKey === this.#piiKey) {
        if (process.env.NODE_ENV !== "production") {
          this.logger?.child({ methodName: "maybeUpdateAndRevalidate" }).debug(
            "Parent object changed, revalidating metadata",
          );
        }
        return this.revalidate(true);
      }
    }

    for (const piiFieldKey of changes.deleted) {
      if (
        piiFieldKey.type === "object"
        && piiFieldKey.otherKeys[0] === this.#piiFieldType
        && piiFieldKey.otherKeys[1] === this.#piiKey
      ) {
        if (process.env.NODE_ENV !== "production") {
          this.logger?.child({ methodName: "maybeUpdateAndRevalidate" }).debug(
            "Parent object deleted, marking as error",
          );
        }
        this.store.batch({}, (batch) => {
          this.writeToStore(undefined, "error", batch);
        });
        return Promise.resolve();
      }
    }

    return undefined;
  };

  invalidatePiiFieldType = (): Promise<void> => {
    return this.revalidate(true);
  };

  dispose(): void {
    if (process.env.NODE_ENV !== "production") {
      this.logger?.child({ methodName: "dispose" }).debug("Disposing query");
    }

    super.dispose();
  }
}
