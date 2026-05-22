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

import type { ObjectSet } from "@shared/types/league-client/coach-api";
import type { BaseCollectionPayload } from "./internal/base-list/BaseCollectionQuery.js";

export interface ObjectSetPayload extends BaseCollectionPayload {
  objectSet: ObjectSet<any, any>;
}
