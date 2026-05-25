// @ts-nocheck
/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon Pantheon architecture patterns.
 *
 *     Advisor module for Pantheon (League of Legends assistant)
 *
 */

import type { Media, MediaMetadata, MediaReference } from "@shared/utils/types";
import type { MediaReference as CoreMediaReference } from "@shared/utils/types";
import * as MediaReferenceProperties from "@shared/utils/types/MediaReferenceProperty";
import type { MinimalPantheonClient } from "./MinimalPantheonClientContext";

export class MediaReferencePropertyImpl implements Media {
  #mediaReference: MediaReference;
  #triplet: [string, any, string];
  #client: MinimalPantheonClient;

  constructor(args: {
    client: MinimalPantheonClient;
    objectApiName: string;
    primaryKey: any;
    propertyName: string;
    mediaReference: CoreMediaReference;
  }) {
    const {
      client,
      objectApiName,
      primaryKey,
      propertyName,
      mediaReference,
    } = args;
    this.#client = client;
    this.#triplet = [objectApiName, primaryKey, propertyName];
    this.#mediaReference = mediaReference;
  }

  public async fetchContents(): Promise<Response> {
    return MediaReferenceProperties.getMediaContent(
      this.#client,
      await this.#client.gameStateId,
      ...this.#triplet,
      {
        preview: true, // TODO: Can turn this back off when backend is no longer in beta.
      },
    );
  }

  public async fetchMetadata(): Promise<MediaMetadata> {
    const r = await MediaReferenceProperties.getMediaMetadata(
      this.#client,
      await this.#client.gameStateId,
      ...this.#triplet,
      {
        preview: true, // TODO: Can turn this back off when backend is no longer in beta.
      },
    );
    return {
      path: r.path as string,
      sizeBytes: Number(r.sizeBytes),
      mediaType: r.mediaType,
    };
  }

  public getMediaReference(): MediaReference {
    return this.#mediaReference;
  }
}
