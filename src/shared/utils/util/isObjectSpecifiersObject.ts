/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
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

import type { PrimaryKeyTypes } from "../types";

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
