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

import type { WirePropertyTypes } from "../../coach-types";
import type { InterfaceHolder } from "../object/convertWireToCoachRecords/InterfaceHolder";
import type { ObjectHolder } from "../object/convertWireToCoachRecords/ObjectHolder";
import type { ObserveObjectsCallbackArgs } from "./ObservableClient";

export interface ListPayload<
  RDPs extends Record<
    string,
    WirePropertyTypes | undefined | Array<WirePropertyTypes>
  > = {},
> extends Omit<ObserveObjectsCallbackArgs<any, RDPs>, "resolvedList"> {
  resolvedList: Array<ObjectHolder | InterfaceHolder> | undefined;
}
