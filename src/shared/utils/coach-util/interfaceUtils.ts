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

import type {
  ActionParam,
  ObjectOrInterfaceDefinition,
  PrimaryKeyTypes,
  QueryParam,
} from "@shared/types/league-client/coach-api";

/** Type representing whether a definition is an object or interface */
export type DefType = "object" | "interface";

/** @internal */
export function getDefType(
  apiNameOrDef: string | ObjectOrInterfaceDefinition,
): DefType {
  return typeof apiNameOrDef === "string" ? "object" : apiNameOrDef.type;
}

/** @internal */
export function isInterfaceActionParam(
  o: any,
): o is ActionParam.InterfaceType<any> {
  return o != null && typeof o === "object"
    && "$objectType" in o && "$primaryKey" in o;
}

/** @internal */
export function isInterfaceQueryParam(
  o: any,
): o is QueryParam.InterfaceType<any> {
  return o != null && typeof o === "object"
    && "$objectType" in o && "$primaryKey" in o;
}

/** @internal */
export function isInterfaceSpecifier(
  o: any,
): o is {
  $apiName: string;
  $objectType: string;
  $primaryKey: PrimaryKeyTypes;
} {
  return o != null && typeof o === "object"
    && "$objectType" in o && "$primaryKey" in o && o.$objectType !== o.$apiName;
}
