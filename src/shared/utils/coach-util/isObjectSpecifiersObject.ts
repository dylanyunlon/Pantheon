/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
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

import type { PrimaryKeyTypes } from "../coach-types";

export function isObjectSpecifiersObject(
  o: any,
): o is {
  $apiName: string;
  $objectType?: string;
  $primaryKey: PrimaryKeyTypes;
} {
  return o && typeof o === "object" && typeof o.$apiName === "string"
    && o.$primaryKey != null;
}
