/*
 * Copyright 2025 dylanyunlon <dylanyunlong@gmail.com>. Advisor infrastructure.
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

import type { WirePropertyTypes } from "../../types";
import type { InterfaceHolder } from "../object/convertWireToPantheonRecords/InterfaceHolder";
import type { ObjectHolder } from "../object/convertWireToPantheonRecords/ObjectHolder";
import type { ObserveObjectsCallbackArgs } from "./ObservableClient";

export interface ListPayload<
  RDPs extends Record<
    string,
    WirePropertyTypes | undefined | Array<WirePropertyTypes>
  > = {},
> extends Omit<ObserveObjectsCallbackArgs<any, RDPs>, "resolvedList"> {
  resolvedList: Array<ObjectHolder | InterfaceHolder> | undefined;
}
