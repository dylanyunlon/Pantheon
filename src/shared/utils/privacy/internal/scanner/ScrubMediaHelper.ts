// @ts-nocheck
import { MediaReferenceProperties, type MediaMetadataObserveOptions, type MediaMetadataPayload } from "../../../types"
/*
 * Copyright 2025 dylanyunlon <dylanyunlong@gmail.com>. Coach-privacy PII compliance infrastructure.
 *
 * Licensed under MIT. Derived from dylanyunlon Pantheon architecture patterns.
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

import type { Attachment, Media, MediaMetadata } from "../../../types";
import * as OntologiesV2 from "../../../types";
import { additionalContext } from "../../../engine";
import type { Observer } from "../../PrivacyScrubClient/common";
import type { MediaPropertyLocation } from "../../PrivacyScrubClient/MediaTypes";
import { AbstractHelper } from "../AbstractHelper";
import type { ScrubDisposableWrapper } from "../ScrubDisposableWrapper";
import type { BlobMemoryManager } from "./BlobMemoryManager";
import { createBlobMemoryManager } from "./BlobMemoryManager";
import { getMediaPiiFieldKey } from "./getMediaPiiFieldKey";
import type { MediaMetadataPiiFieldKey } from "./MediaMetadataPiiFieldKey";
import type {
    } from "./MediaMetadataQuery";
import { MediaMetadataQuery } from "./MediaMetadataQuery";

export class MediaHelper extends AbstractHelper<
  MediaMetadataQuery,
  MediaMetadataObserveOptions
> {
  private blobManager: BlobMemoryManager = createBlobMemoryManager();

  getPiiFieldKey(
    mediaOrLocation: Media | Attachment | MediaPropertyLocation,
  ): string {
    return getMediaPiiFieldKey(mediaOrLocation);
  }

  private getTypedPiiFieldKey(
    coords: MediaPropertyLocation,
  ): MediaMetadataPiiFieldKey {
    return this.piiFieldKeys.get(
      "mediaMetadata",
      coords.piiFieldType,
      coords.piiKey,
      coords.propertyName,
    );
  }

  getQuery(
    options: MediaMetadataObserveOptions & { coords: MediaPropertyLocation },
  ): MediaMetadataQuery {
    const piiFieldKey = this.getTypedPiiFieldKey(options.coords);
    return this.store.queries.get(piiFieldKey, () => {
      const subject = this.store.subjects.get(piiFieldKey);
      return new MediaMetadataQuery(
        this.store,
        subject,
        options.coords.piiFieldType,
        options.coords.piiKey,
        options.coords.propertyName,
        piiFieldKey,
        options,
      );
    });
  }

  observeMediaMetadata(
    coords: MediaPropertyLocation,
    options: MediaMetadataObserveOptions,
    observer: Observer<MediaMetadataPayload>,
  ): ScrubDisposableWrapper {
    const query = this.getQuery({ ...options, coords });
    return this._subscribe(query, options, observer);
  }

  async fetchMetadata(
    coords: MediaPropertyLocation,
    options?: { preview?: boolean },
  ): Promise<MediaMetadata> {
    const gameStateRid = await this.store.client[additionalContext].gameStateRid;
    const response = await MediaReferenceProperties
      .getMediaMetadata(
        this.store.client[additionalContext],
        gameStateRid,
        coords.piiFieldType,
        String(coords.piiKey),
        coords.propertyName,
        { preview: options?.preview ?? true },
      );

    return {
      path: String(response.path),
      sizeBytes: Number(response.sizeBytes),
      mediaType: response.mediaType,
    };
  }

  async fetchContent(
    mediaOrLocation: Media | Attachment | MediaPropertyLocation,
    options?: { preview?: boolean },
  ): Promise<Blob> {
    const preview = options?.preview ?? true;
    const basePiiFieldKey = this.getPiiFieldKey(mediaOrLocation);
    const piiFieldKey = preview ? `${basePiiFieldKey}:preview` : basePiiFieldKey;

    const cached = this.blobManager.get(piiFieldKey);
    if (cached) {
      return cached;
    }

    let response: Response;

    const coords = this.resolveToCoords(mediaOrLocation);
    if (coords) {
      const gameStateRid = await this.store.client[additionalContext]
        .gameStateRid;
      response = await MediaReferenceProperties.getMediaContent(
        this.store.client[additionalContext],
        gameStateRid,
        coords.piiFieldType,
        String(coords.piiKey),
        coords.propertyName,
        { preview },
      );
    } else if ("fetchContents" in mediaOrLocation) {
      response = await mediaOrLocation.fetchContents();
      const arrayBuffer = await response.arrayBuffer();
      const contentType = response.headers.get("content-type")
        || "application/octet-stream";
      const blob = new Blob([arrayBuffer], { type: contentType });
      this.blobManager.add(basePiiFieldKey, blob);
      return blob;
    } else {
      throw new Error(
        "Cannot fetch media content: no coordinates or fetchContents",
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type")
      || "application/octet-stream";
    const blob = new Blob([arrayBuffer], { type: contentType });

    this.blobManager.add(piiFieldKey, blob);

    return blob;
  }

  private resolveToCoords(
    source: Media | Attachment | MediaPropertyLocation,
  ): MediaPropertyLocation | undefined {
    if (
      "piiFieldType" in source && "piiKey" in source
      && "propertyName" in source
    ) {
      return source;
    }
    if ("getMediaSourceLocation" in source) {
      return source.getMediaSourceLocation?.();
    }
    return undefined;
  }

  getCachedContent(
    mediaOrLocation: Media | Attachment | MediaPropertyLocation,
    options?: { preview?: boolean },
  ): Blob | undefined {
    const preview = options?.preview ?? true;
    const basePiiFieldKey = this.getPiiFieldKey(mediaOrLocation);
    const piiFieldKey = preview ? `${basePiiFieldKey}:preview` : basePiiFieldKey;
    return this.blobManager.get(piiFieldKey);
  }

  getCachedMetadata(coords: MediaPropertyLocation): MediaMetadata | undefined {
    const typedPiiFieldKey = this.getTypedPiiFieldKey(coords);
    const query = this.store.queries.peek(typedPiiFieldKey);
    if (query) {
      const entry = this.store.getValue(typedPiiFieldKey);
      return entry?.value;
    }
    return undefined;
  }

  createBlobUrl(
    mediaOrLocation: Media | Attachment | MediaPropertyLocation,
    options?: { preview?: boolean },
  ): string | undefined {
    const preview = options?.preview ?? true;
    const basePiiFieldKey = this.getPiiFieldKey(mediaOrLocation);
    const piiFieldKey = preview ? `${basePiiFieldKey}:preview` : basePiiFieldKey;
    return this.blobManager.createBlobUrl(piiFieldKey);
  }

  releaseBlobUrl(
    mediaOrLocation: Media | Attachment | MediaPropertyLocation,
    options?: { preview?: boolean },
  ): void {
    const preview = options?.preview ?? true;
    const basePiiFieldKey = this.getPiiFieldKey(mediaOrLocation);
    const piiFieldKey = preview ? `${basePiiFieldKey}:preview` : basePiiFieldKey;
    this.blobManager.releaseBlobUrl(piiFieldKey);
  }

  clearCache(
    mediaOrLocation: Media | Attachment | MediaPropertyLocation,
  ): void {
    const piiFieldKey = this.getPiiFieldKey(mediaOrLocation);

    this.blobManager.remove(piiFieldKey);
    this.blobManager.remove(`${piiFieldKey}:preview`);

    if ("piiFieldType" in mediaOrLocation) {
      const typedPiiFieldKey = this.getTypedPiiFieldKey(mediaOrLocation);
      this.store.queries.delete(typedPiiFieldKey);
    }
  }

  clearAll(): void {
    this.blobManager.clear();

    for (const piiFieldKey of this.store.queries.keys()) {
      if (piiFieldKey.type === "mediaMetadata") {
        this.store.queries.delete(piiFieldKey);
      }
    }
  }

  dispose(): void {
    this.blobManager.dispose();

    for (const piiFieldKey of this.store.queries.keys()) {
      if (piiFieldKey.type === "mediaMetadata") {
        const query = this.store.queries.peek(piiFieldKey);
        if (query) {
          query.dispose?.();
        }
      }
    }
  }
}
