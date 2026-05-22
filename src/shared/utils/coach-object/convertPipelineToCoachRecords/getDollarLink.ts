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
  PipelineSet,
  CoachRecordLinksObject,
  SelectArg,
  SingleLinkAccessor,
  WhereClause,
} from "../../../coach-types";
import { getWirePipelineSet } from "../../coach-pipeline/createPipeline.js";
import { fetchSingle, fetchSingleWithErrors } from "../fetchSingle.js";
import type { InterfaceHolder } from "./InterfaceHolder.js";
import {
  ClientRef,
  InterfaceDefRef,
  ObjectDefRef,
  UnderlyingCoachRecord,
} from "./InternalSymbols.js";
import type { ObjectHolder } from "./ObjectHolder.js";

/** @internal */
export function get$link(
  holder: ObjectHolder,
): CoachRecordLinksObject<any> {
  const client = holder[ClientRef];
  const objDef = holder[ObjectDefRef];
  const rawObj = holder[UnderlyingCoachRecord];
  return Object.freeze(Object.fromEntries(
    Object.keys(objDef.links).map(
      (linkName) => {
        const linkDef = objDef.links[linkName as keyof typeof objDef.links];
        const pipelineSet =
          (client.objectSetFactory(objDef, client) as PipelineSet<any>)
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
                getWirePipelineSet(pipelineSet),
              ),
            fetchOneWithErrors: <A extends SelectArg<any, any, any, any>>(
              options?: A,
            ) =>
              fetchSingleWithErrors(
                client,
                objDef,
                options ?? {},
                getWirePipelineSet(pipelineSet),
              ),
          } as SingleLinkAccessor<any>
          : pipelineSet;

        return [linkName, value];
      },
    ),
  ));
}

/** @internal */
export function get$linkForInterface(
  holder: InterfaceHolder,
): CoachRecordLinksObject<any> {
  const client = holder[UnderlyingCoachRecord][ClientRef];
  const objDef = holder[UnderlyingCoachRecord][ObjectDefRef];
  const interfaceDef = holder[InterfaceDefRef];
  const rawObj = holder[UnderlyingCoachRecord];
  return Object.freeze(Object.fromEntries(
    Object.keys(interfaceDef.links).map(
      (linkName) => {
        const linkDef =
          interfaceDef.links[linkName as keyof typeof objDef.links];
        const pipelineSet =
          (client.objectSetFactory(interfaceDef, client) as PipelineSet<any>)
            .intersect(
              (client.objectSetFactory(objDef, client) as PipelineSet<any>)
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
                getWirePipelineSet(pipelineSet),
              ),
            fetchOneWithErrors: <A extends SelectArg<any, any, any, any>>(
              options?: A,
            ) =>
              fetchSingleWithErrors(
                client,
                linkTargetDef,
                options ?? {},
                getWirePipelineSet(pipelineSet),
              ),
          } as SingleLinkAccessor<any>
          : pipelineSet;

        return [linkName, value];
      },
    ),
  ));
}
