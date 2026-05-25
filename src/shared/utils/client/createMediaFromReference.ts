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
import { MediaSets } from "@shared/utils/types";
import invariant from "../util/invariant";
import type { Client } from "./PantheonClient";
import { clientContext } from "./PantheonClient";
import type { MinimalPantheonClient } from "./MinimalPantheonClientContext";

export function createMediaFromReference(
  client: Client,
  mediaReference: MediaReference,
): Media {
  return createMediaFromReferenceInternal(
    client[clientContext],
    mediaReference,
  );
}

export function createMediaFromReferenceInternal(
  client: MinimalPantheonClient,
  mediaReference: MediaReference,
): Media {
  const { mediaSetRid, mediaItemRid } =
    (mediaReference as any).reference.mediaSetViewItem;
  const token = (mediaReference as any).reference.mediaSetViewItem.token;
  return {
    async fetchContents(): Promise<Response> {
      return MediaSets.read(
        client,
        mediaSetRid,
        mediaItemRid,
        { preview: true },
        token ? { ReadToken: token } : undefined,
      );
    },

    async fetchMetadata(): Promise<MediaMetadata> {
      const info = await MediaSets.info(
        client,
        mediaSetRid,
        mediaItemRid,
        { preview: true },
        token ? { ReadToken: token } : undefined,
      );

      invariant(info.sizeBytes != null, "Expected sizeBytes in media info");
      invariant(info.mimeType != null, "Expected mimeType in media info");

      return {
        path: info.path,
        sizeBytes: info.sizeBytes,
        mediaType: info.mimeType,
      };
    },

    getMediaReference(): MediaReference {
      return mediaReference;
    },
  };
}
