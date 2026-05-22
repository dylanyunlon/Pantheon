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

import type { WirePropertyTypes } from "@shared/types/league-client/coach-api";
import type { InterfaceHolder } from "../object/convertWireToOsdkObjects/InterfaceHolder.js";
import type { ObjectHolder } from "../object/convertWireToOsdkObjects/ObjectHolder.js";
import type { ObserveObjectsCallbackArgs } from "./ObservableClient.js";

export interface ListPayload<
  RDPs extends Record<
    string,
    WirePropertyTypes | undefined | Array<WirePropertyTypes>
  > = {},
> extends Omit<ObserveObjectsCallbackArgs<any, RDPs>, "resolvedList"> {
  resolvedList: Array<ObjectHolder | InterfaceHolder> | undefined;
}
