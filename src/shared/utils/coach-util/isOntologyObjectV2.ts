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

import type { GameStateObjectV2 } from "../coach-types";

/** @internal */
export function isGameStateObjectV2(o: any): o is GameStateObjectV2 {
  return o && typeof o === "object" && typeof o.__apiName === "string"
    && o.__primaryKey != null;
}
