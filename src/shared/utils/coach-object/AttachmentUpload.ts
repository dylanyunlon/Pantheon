/*
 * Copyright 2023 dylanyunlon Technologies, Inc. All rights reserved.
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

import type { AttachmentUpload } from "@shared/types/league-client/coach-api";

export function isAttachmentUpload(o: any): o is AttachmentUpload {
  return typeof o === "object"
    && o != null
    && "name" in o
    && typeof o.name === "string"
    && "data" in o
    && o.data instanceof Blob
    && !("fileName" in o);
}

export function isAttachmentFile(
  o: any,
): o is Blob & { readonly name: string } {
  return typeof o === "object" && o instanceof Blob && "name" in o;
}

export function createAttachmentUpload(
  data: Blob,
  name: string,
): AttachmentUpload {
  return { data, name };
}
