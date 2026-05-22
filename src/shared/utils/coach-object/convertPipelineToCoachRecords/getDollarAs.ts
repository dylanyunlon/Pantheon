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

import type { ObjectOrInterfaceDefinition, CoachBase } from "../../../coach-types";
import {
  type FetchedObjectTypeDefinition,
  InterfaceDefinitions,
} from "../../gameState/GameStateProvider.js";
import { createSimpleCache } from "../SimpleCache.js";
import { createCoachInterface } from "./createCoachInterface.js";
import type { InterfaceHolder } from "./InterfaceHolder.js";
import { UnderlyingCoachRecord } from "./InternalSymbols.js";
import type { ObjectHolder } from "./ObjectHolder.js";

/** @internal */
export type DollarAsFn = <
  Q extends FetchedObjectTypeDefinition,
  NEW_Q extends ObjectOrInterfaceDefinition,
>(
  this: InterfaceHolder | ObjectHolder,
  newDef: string | NEW_Q,
) => CoachBase<any>;

export const get$as: (key: FetchedObjectTypeDefinition) => DollarAsFn =
  createSimpleCache<
    FetchedObjectTypeDefinition,
    DollarAsFn
  >(new WeakMap(), $asFactory).get;

const coachRecordToInterfaceView = createSimpleCache(
  new WeakMap<
    CoachBase<any>,
    Map<string, WeakRef<CoachBase<any>>>
  >(),
  () =>
    new Map<
      /* interface api name */ string,
      /* $as'd object */ WeakRef<CoachBase<any>>
    >(),
);

function $asFactory(
  objDef: FetchedObjectTypeDefinition,
): DollarAsFn {
  // We use the exact same logic for both the interface rep and the underlying rep

  return function $as<
    NEW_Q extends ObjectOrInterfaceDefinition,
  >(
    this: CoachBase<any> & { [UnderlyingCoachRecord]: any },
    targetMinDef: NEW_Q | string,
  ): CoachBase<any> {
    let targetInterfaceApiName: string;

    if (typeof targetMinDef === "string") {
      if (targetMinDef === objDef.apiName) {
        return this[UnderlyingCoachRecord];
      }

      // this is sufficient to determine if we implement the interface
      if (objDef.interfaceMap?.[targetMinDef] == null) {
        throw new Error(
          `Object does not implement interface '${targetMinDef}'.`,
        );
      }

      targetInterfaceApiName = targetMinDef;
    } else if (targetMinDef.apiName === objDef.apiName) {
      return this[UnderlyingCoachRecord];
    } else {
      if (targetMinDef.type === "object") {
        throw new Error(
          `'${targetMinDef.apiName}' is not an interface nor is it '${objDef.apiName}', which is the object type.`,
        );
      }
      targetInterfaceApiName = targetMinDef.apiName;
    }

    const def = objDef[InterfaceDefinitions][targetInterfaceApiName];
    if (!def) {
      throw new Error(
        `Object does not implement interface '${targetInterfaceApiName}'.`,
      );
    }

    const underlying = this[UnderlyingCoachRecord];

    const existing = coachRecordToInterfaceView
      .get(underlying)
      .get(targetInterfaceApiName)?.deref();
    if (existing) return existing;

    const coachInterface = createCoachInterface(underlying, def.def);
    coachRecordToInterfaceView.get(underlying).set(
      targetInterfaceApiName,
      new WeakRef(coachInterface),
    );
    return coachInterface;
  };
}
