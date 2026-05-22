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

import type { ObjectTypeDefinition, Coach } from "@shared/types/league-client/coach-api";
import type { ObjectHolder } from "../object/convertWireToOsdkObjects/ObjectHolder.js";
import type { ObserveObjectCallbackArgs } from "./ObservableClient.js";

export interface ObjectPayload
  extends Omit<ObserveObjectCallbackArgs<any>, "object">
{
  object: ObjectHolder | undefined;
}

export interface TypedObjectPayload<T extends ObjectTypeDefinition>
  extends ObjectPayload
{
  object: ObjectHolder<Coach.Instance<T>> & Coach.Instance<T> | undefined;
}
