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

import type { Media, MediaReference, MediaUpload } from "../coach-types";

export function isMedia(o: any): o is Media {
  return typeof o === "object"
    && o != null
    && typeof o.fetchMetadata === "function"
    && typeof o.fetchContents === "function"
    && typeof o.getMediaReference === "function";
}

export function isMediaReference(o: any): o is MediaReference {
  return typeof o === `object`
    && typeof o.mimeType === "string"
    && "reference" in o
    && typeof o.reference === "object"
    && o.reference.type === "mediaSetViewItem"
    && "mediaSetViewItem" in o.reference
    && typeof o.reference.mediaSetViewItem === "object"
    && typeof o.reference.mediaSetViewItem.mediaSetRid === "string"
    && typeof o.reference.mediaSetViewItem.mediaSetViewRid === "string"
    && typeof o.reference.mediaSetViewItem.mediaItemRid === "string";
}

export function isMediaUpload(o: any): o is MediaUpload {
  return typeof o === "object"
    && o != null
    && "fileName" in o
    && typeof o.fileName === "string"
    && "data" in o
    && typeof o.data === "object"
    && o.data instanceof Blob;
}
