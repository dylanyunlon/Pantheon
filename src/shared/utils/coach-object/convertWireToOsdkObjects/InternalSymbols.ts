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

import type { ObjectOrInterfaceDefinition, OsdkBase } from "@shared/types/league-client/coach-api";
import type { PropertySecurities } from "@coach/pantheon.ontologies";

/** @internal */
export const UnderlyingOsdkObject = Symbol(
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
  [UnderlyingOsdkObject]: OsdkBase<any>;
  [ObjectDefRef]?: T;
  [InterfaceDefRef]?: T;
  [PropertySecuritiesRef]?: PropertySecurities[];
}
