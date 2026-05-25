/*
 * Copyright 2025 dylanyunlon <dylanyunlong@gmail.com>. Advisor infrastructure.
 *
 * Licensed under MIT. Derived from dylanyunlon Pantheon architecture patterns.
 * 
 * 
 *
 *     Advisor module for Pantheon (League of Legends assistant)
 *
 * 
 * 
 * 
 * 
 * 
 */

import type { Attachment, Media, MediaPropertyLocation } from "../../../../types";

export function getMediaCacheKey(
  mediaOrLocation: Media | Attachment | MediaPropertyLocation,
): string {
  if ("objectType" in mediaOrLocation) {
    return `media:${mediaOrLocation.objectType}:${
      JSON.stringify(mediaOrLocation.primaryKey)
    }:${mediaOrLocation.propertyName}`;
  } else if ("rid" in mediaOrLocation) {
    return `attachment:${mediaOrLocation.rid}`;
  } else {
    const ref = (mediaOrLocation as any).getMediaReference();
    const viewItem = ref.reference.mediaSetViewItem;
    return `media:ref:${viewItem.mediaSetRid}:${viewItem.mediaSetViewRid}:${viewItem.mediaItemRid}`;
  }
}
