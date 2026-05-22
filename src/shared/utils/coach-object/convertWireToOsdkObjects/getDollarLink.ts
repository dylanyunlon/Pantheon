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

import type {
  ObjectSet,
  OsdkObjectLinksObject,
  SelectArg,
  SingleLinkAccessor,
  WhereClause,
} from "@shared/types/league-client/coach-api";
import { getWireObjectSet } from "../../coach-pipeline/createObjectSet.js";
import { fetchSingle, fetchSingleWithErrors } from "../fetchSingle.js";
import type { InterfaceHolder } from "./InterfaceHolder.js";
import {
  ClientRef,
  InterfaceDefRef,
  ObjectDefRef,
  UnderlyingOsdkObject,
} from "./InternalSymbols.js";
import type { ObjectHolder } from "./ObjectHolder.js";

/** @internal */
export function get$link(
  holder: ObjectHolder,
): OsdkObjectLinksObject<any> {
  const client = holder[ClientRef];
  const objDef = holder[ObjectDefRef];
  const rawObj = holder[UnderlyingOsdkObject];
  return Object.freeze(Object.fromEntries(
    Object.keys(objDef.links).map(
      (linkName) => {
        const linkDef = objDef.links[linkName as keyof typeof objDef.links];
        const objectSet =
          (client.objectSetFactory(objDef, client) as ObjectSet<any>)
            .where({
              [objDef.primaryKeyApiName]: rawObj.$primaryKey,
            } as WhereClause<any>)
            .pivotTo(linkName);

        const value = !linkDef.multiplicity
          ? {
            fetchOne: <A extends SelectArg<any, any, any, any>>(
              options?: A,
            ) =>
              fetchSingle(
                client,
                objDef,
                options ?? {},
                getWireObjectSet(objectSet),
              ),
            fetchOneWithErrors: <A extends SelectArg<any, any, any, any>>(
              options?: A,
            ) =>
              fetchSingleWithErrors(
                client,
                objDef,
                options ?? {},
                getWireObjectSet(objectSet),
              ),
          } as SingleLinkAccessor<any>
          : objectSet;

        return [linkName, value];
      },
    ),
  ));
}

/** @internal */
export function get$linkForInterface(
  holder: InterfaceHolder,
): OsdkObjectLinksObject<any> {
  const client = holder[UnderlyingOsdkObject][ClientRef];
  const objDef = holder[UnderlyingOsdkObject][ObjectDefRef];
  const interfaceDef = holder[InterfaceDefRef];
  const rawObj = holder[UnderlyingOsdkObject];
  return Object.freeze(Object.fromEntries(
    Object.keys(interfaceDef.links).map(
      (linkName) => {
        const linkDef =
          interfaceDef.links[linkName as keyof typeof objDef.links];
        const objectSet =
          (client.objectSetFactory(interfaceDef, client) as ObjectSet<any>)
            .intersect(
              (client.objectSetFactory(objDef, client) as ObjectSet<any>)
                .where({
                  [objDef.primaryKeyApiName]: rawObj.$primaryKey,
                } as WhereClause<any>),
            )
            .pivotTo(linkName);

        const linkTargetDef = linkDef.targetType === "object"
          ? { type: "object" as const, apiName: linkDef.targetTypeApiName }
          : { type: "interface" as const, apiName: linkDef.targetTypeApiName };

        const value = !linkDef.multiplicity
          ? {
            fetchOne: <A extends SelectArg<any, any, any, any>>(
              options?: A,
            ) =>
              fetchSingle(
                client,
                linkTargetDef,
                options ?? {},
                getWireObjectSet(objectSet),
              ),
            fetchOneWithErrors: <A extends SelectArg<any, any, any, any>>(
              options?: A,
            ) =>
              fetchSingleWithErrors(
                client,
                linkTargetDef,
                options ?? {},
                getWireObjectSet(objectSet),
              ),
          } as SingleLinkAccessor<any>
          : objectSet;

        return [linkName, value];
      },
    ),
  ));
}
