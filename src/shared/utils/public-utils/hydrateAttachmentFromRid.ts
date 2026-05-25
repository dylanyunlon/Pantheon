// @ts-nocheck
/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon Pantheon architecture patterns.
 *
 *     Advisor module for Pantheon (League of Legends assistant)
 *
 */

import type { Attachment } from "@shared/utils/types";
import { Attachments } from "../types";
import { coachClientContext, type PantheonClient } from "../pantheon-client/PantheonClient";
import type { MinimalPantheonClient } from "../pantheon-client/MinimalPantheonClientContext";

/**
 * Helper function to create an attachment type from a rid
 * @param client -  An COACH client.
 * @param rid - The rid of attachment in Pantheon.
 * @returns An COACH attachment object
 */
export function hydrateAttachmentFromRid(
  client: any,
  rid: string,
): Attachment {
  return hydrateAttachmentFromRidInternal(client[coachClientContext], rid);
}

/** @internal */
export function hydrateAttachmentFromRidInternal(
  client: MinimalPantheonClient,
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
