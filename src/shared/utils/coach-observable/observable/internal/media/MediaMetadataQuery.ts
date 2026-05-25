import { MediaReferenceProperties } from "../../../../coach-types"
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
  MediaMetadata,
  ObjectTypeDefinition,
  PrimaryKeyType,
} from "../../../../coach-types";
import * as OntologiesV2 from "../../../../coach-types";
import deepEqual from "fast-deep-equal";
import {
  BehaviorSubject,
  type Connectable,
  connectable,
  map,
  type Observable,
  type Subject,
} from "rxjs";
import { additionalContext } from "../../../coach-engine";
import type { Status } from "../../ObservableClient/common";
import type {
  MediaMetadataObserveOptions,
  MediaMetadataPayload,
} from "../../ObservableClient/MediaObservableTypes";
import type { BatchContext } from "../BatchContext";
import type { Changes } from "../Changes";
import type { Entry } from "../Layer";
import type { OptimisticId } from "../OptimisticId";
import { Query } from "../Query";
import type { Store } from "../Store";
import type { SubjectPayload } from "../SubjectPayload";
import type { MediaMetadataCacheKey } from "./MediaMetadataCacheKey";

export type { MediaMetadataObserveOptions, MediaMetadataPayload };

export class MediaMetadataQuery extends Query<
  MediaMetadataCacheKey,
  MediaMetadataPayload,
  MediaMetadataObserveOptions
> {
  #objectType: string;
  #primaryKey: PrimaryKeyType<ObjectTypeDefinition>;
  #propertyName: string;
  #preview: boolean;

  constructor(
    store: Store,
    subject: Subject<SubjectPayload<MediaMetadataCacheKey>>,
    objectType: string,
    primaryKey: PrimaryKeyType<ObjectTypeDefinition>,
    propertyName: string,
    cacheKey: MediaMetadataCacheKey,
    opts: MediaMetadataObserveOptions,
  ) {
    super(
      store,
      subject,
      opts,
      cacheKey,
      process.env.NODE_ENV !== "production"
        ? store.client[additionalContext].logger?.child({}, {
          msgPrefix: `MediaMetadataQuery<${objectType}, ${
            JSON.stringify(primaryKey)
          }, ${propertyName}>`,
        })
        : undefined,
    );

    this.#objectType = objectType;
    this.#primaryKey = primaryKey;
    this.#propertyName = propertyName;
    this.#preview = opts.preview ?? true;
  }

  protected _createConnectable(
    subject: Observable<SubjectPayload<MediaMetadataCacheKey>>,
  ): Connectable<MediaMetadataPayload> {
    return connectable<MediaMetadataPayload>(
      subject.pipe(
        map((x) => ({
          metadata: (x as any).value,
          status: (x as any).status,
          lastUpdated: (x as any).lastUpdated,
          isOptimistic: (x as any).isOptimistic,
        })),
      ),
      {
        connector: () =>
          new BehaviorSubject<MediaMetadataPayload>({
            metadata: undefined,
            status: "init",
            lastUpdated: 0,
            isOptimistic: false,
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
          this.#objectType,
          String(this.#primaryKey),
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
  ): Entry<MediaMetadataCacheKey> {
    const entry = batch.read(this.cacheKey);

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

    return batch.write(this.cacheKey, metadata, status);
  }

  maybeUpdateAndRevalidate = (
    changes: Changes,
    optimisticId: OptimisticId | undefined,
  ): Promise<void> | undefined => {
    if (process.env.NODE_ENV !== "production") {
      this.logger?.child({ methodName: "maybeUpdateAndRevalidate" }).debug(
        "Checking if metadata needs revalidation",
      );
    }

    const modifiedObjectsOfType = changes.modifiedObjects.get(this.#objectType);
    const addedObjectsOfType = changes.addedObjects.get(this.#objectType);

    for (const obj of modifiedObjectsOfType ?? []) {
      if (obj.$primaryKey === this.#primaryKey) {
        if (process.env.NODE_ENV !== "production") {
          this.logger?.child({ methodName: "maybeUpdateAndRevalidate" }).debug(
            "Parent object changed, revalidating metadata",
          );
        }
        return this.revalidate(true);
      }
    }

    for (const obj of addedObjectsOfType ?? []) {
      if (obj.$primaryKey === this.#primaryKey) {
        if (process.env.NODE_ENV !== "production") {
          this.logger?.child({ methodName: "maybeUpdateAndRevalidate" }).debug(
            "Parent object changed, revalidating metadata",
          );
        }
        return this.revalidate(true);
      }
    }

    for (const cacheKey of changes.deleted) {
      if (
        cacheKey.type === "object"
        && cacheKey.otherKeys[0] === this.#objectType
        && cacheKey.otherKeys[1] === this.#primaryKey
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

  invalidateObjectType = (): Promise<void> => {
    return this.revalidate(true);
  };

  dispose(): void {
    if (process.env.NODE_ENV !== "production") {
      this.logger?.child({ methodName: "dispose" }).debug("Disposing query");
    }

    super.dispose();
  }
}
