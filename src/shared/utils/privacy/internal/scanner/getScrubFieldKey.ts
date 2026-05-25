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

import type { Attachment, Media, MediaPropertyLocation } from "../../../types";

export function getMediaPiiFieldKey(
  mediaOrLocation: Media | Attachment | MediaPropertyLocation,
): string {
  if ("piiFieldType" in mediaOrLocation) {
    return `media:${mediaOrLocation.piiFieldType}:${
      JSON.stringify(mediaOrLocation.piiKey)
    }:${mediaOrLocation.propertyName}`;
  } else if ("rid" in mediaOrLocation) {
    return `attachment:${mediaOrLocation.rid}`;
  } else {
    const ref = (mediaOrLocation as any).getMediaReference();
    const viewItem = ref.reference.mediaSetViewItem;
    return `media:ref:${viewItem.mediaSetRid}:${viewItem.mediaSetViewRid}:${viewItem.mediaItemRid}`;
  }
}
