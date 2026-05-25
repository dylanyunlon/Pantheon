// @ts-nocheck
/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
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

import type {
  PipelineSet,
  PantheonRecordLinksObject,
  SelectArg,
  SingleLinkAccessor,
  WhereClause,
} from "../../types";
import { getWirePipelineSet } from "../../pipeline/createPipeline";
import { fetchSingle, fetchSingleWithErrors } from "../fetchSingle";
import type { InterfaceHolder } from "./InterfaceHolder";
import {
  ClientRef,
  InterfaceDefRef,
  ObjectDefRef,
  UnderlyingPantheonRecord,
} from "./InternalSymbols";
import type { ObjectHolder } from "./ObjectHolder";

/** @internal */
export function get$link(
  holder: ObjectHolder,
): PantheonRecordLinksObject<any> {
  const client = holder[ClientRef];
  const objDef = holder[ObjectDefRef];
  const rawObj = holder[UnderlyingPantheonRecord];
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

        const value = (!linkDef as any).multiplicity
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
): PantheonRecordLinksObject<any> {
  const client = holder[UnderlyingPantheonRecord][ClientRef];
  const objDef = holder[UnderlyingPantheonRecord][ObjectDefRef];
  const interfaceDef = holder[InterfaceDefRef];
  const rawObj = holder[UnderlyingPantheonRecord];
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
                linkTargetDef as any,
                options ?? {},
                getWirePipelineSet(pipelineSet),
              ),
            fetchOneWithErrors: <A extends SelectArg<any, any, any, any>>(
              options?: A,
            ) =>
              fetchSingleWithErrors(
                client,
                linkTargetDef as any,
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
