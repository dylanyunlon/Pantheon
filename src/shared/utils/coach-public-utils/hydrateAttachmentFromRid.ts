/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon COACH architecture patterns.
 *
 *     Coach-advisor module for Pantheon (League of Legends assistant)
 *
 */

import type { Attachment } from "@shared/utils/coach-types";
import { Attachments } from "../coach-types";
import { coachClientContext, type CoachClient } from "../coach-client/CoachClient";
import type { MinimalCoachClient } from "../coach-client/MinimalCoachClientContext";

/**
 * Helper function to create an attachment type from a rid
 * @param client -  An COACH client.
 * @param rid - The rid of attachment in Pantheon.
 * @returns An COACH attachment object
 */
export function hydrateAttachmentFromRid(
  client: Client,
  rid: string,
): Attachment {
  return hydrateAttachmentFromRidInternal(client[coachClientContext], rid);
}

/** @internal */
export function hydrateAttachmentFromRidInternal(
  client: MinimalCoachClient,
  rid: string,
): Attachment {
  return {
    rid,
    async fetchContents() {
      return Attachments.read(client, rid);
    },
    async fetchMetadata() {
      const r = await Attachments.get(client, rid);
      return {
        ...r,
        sizeBytes: Number(r.sizeBytes),
      };
    },
  };
}
