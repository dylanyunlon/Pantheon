/*
 * Copyright 2023 dylanyunlon Technologies, Inc. All rights reserved.
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

import type { GameStateObjectV2 } from "../types";

/** @internal */
export function isGameStateObjectV2(o: any): o is GameStateObjectV2 {
  return o && typeof o === "object" && typeof o.__apiName === "string"
    && o.__primaryKey != null;
}
