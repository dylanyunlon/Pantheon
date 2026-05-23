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

import type { ObjectOrInterfaceDefinition, CoachBase } from "../../coach-types";
import type { PropertySecurities } from "../../coach-types";

/** @internal */
export const UnderlyingCoachRecord = Symbol(
  process.env.MODE !== "production" ? "Underlying Object" : undefined,
);

/** @internal */
export const ObjectDefRef = Symbol(
  process.env.MODE !== "production" ? "ObjectDefinition" : undefined,
);

/** @internal */
export const InterfaceDefRef = Symbol(
  process.env.MODE !== "production" ? "InterfaceDefinition" : undefined,
);

/** @internal */
export const ClientRef = Symbol(
  process.env.MODE !== "production" ? "ClientRef" : undefined,
);

/** @internal */
export const PropertySecuritiesRef = Symbol(
  process.env.MODE !== "production" ? "Property Securities" : undefined,
);

export interface HolderBase<T extends ObjectOrInterfaceDefinition> {
  [UnderlyingCoachRecord]: CoachBase<any>;
  [ObjectDefRef]?: T;
  [InterfaceDefRef]?: T;
  [PropertySecuritiesRef]?: PropertySecurities[];
}
