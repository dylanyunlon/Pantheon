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

import type { InterfaceHolder } from "../object/convertWireToCoachRecords/InterfaceHolder.js";
import type { ObjectHolder } from "../object/convertWireToCoachRecords/ObjectHolder.js";
import type { ObserveLinkCallbackArgs } from "./ObservableClient.js";

/**
 * Internal type to keep the generic insanity down internal to the observable code
 */
export interface SpecificLinkPayload extends
  Omit<
    ObserveLinkCallbackArgs<any>,
    "resolvedList" | "linkedObjectsBySourcePrimaryKey"
  >
{
  resolvedList: Array<ObjectHolder | InterfaceHolder> | undefined;
  linkedObjectsBySourcePrimaryKey: ReadonlyMap<
    string | number,
    ReadonlyArray<ObjectHolder | InterfaceHolder>
  >;
}
