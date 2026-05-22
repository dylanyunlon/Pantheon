/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon COACH architecture patterns.
 *
 *     Coach-advisor module for Pantheon (League of Legends assistant)
 *
 */

import type { Media, MediaMetadata, MediaReference } from "@shared/utils/coach-types";
import { MediaSets } from "@shared/utils/coach-types";
import invariant from "../coach-util/invariant";
import type { Client } from "./CoachClient";
import { coachClientContext } from "./CoachClient";
import type { MinimalCoachClient } from "./MinimalCoachClientContext";

export function createMediaFromReference(
  client: Client,
  mediaReference: MediaReference,
): Media {
  return createMediaFromReferenceInternal(
    client[coachClientContext],
    mediaReference,
  );
}

export function createMediaFromReferenceInternal(
  client: MinimalCoachClient,
  mediaReference: MediaReference,
): Media {
  const { mediaSetRid, mediaItemRid } =
    mediaReference.reference.mediaSetViewItem;
  const token = mediaReference.reference.mediaSetViewItem.token;
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
