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

import type { ObjectOrInterfaceDefinition, PantheonBase } from "../../types";
import {
  type FetchedObjectTypeDefinition,
  InterfaceDefinitions,
} from "../../gamestate/GameStateProvider";
import { createSimpleCache } from "../SimpleCache";
import { createPantheonInterface } from "./createPantheonInterface";
import type { InterfaceHolder } from "./InterfaceHolder";
import { UnderlyingPantheonRecord } from "./InternalSymbols";
import type { ObjectHolder } from "./ObjectHolder";

/** @internal */
export type DollarAsFn = <
  Q extends FetchedObjectTypeDefinition,
  NEW_Q extends ObjectOrInterfaceDefinition,
>(
  this: InterfaceHolder | ObjectHolder,
  newDef: string | NEW_Q,
) => PantheonBase<any>;

export const get$as: (key: FetchedObjectTypeDefinition) => DollarAsFn =
  createSimpleCache<
    FetchedObjectTypeDefinition,
    DollarAsFn
  >(new WeakMap(), $asFactory).get;

const coachRecordToInterfaceView = createSimpleCache(
  new WeakMap<
    PantheonBase<any>,
    Map<string, WeakRef<PantheonBase<any>>>
  >(),
  () =>
    new Map<
      /* interface api name */ string,
      /* $as'd object */ WeakRef<PantheonBase<any>>
    >(),
);

function $asFactory(
  objDef: FetchedObjectTypeDefinition,
): DollarAsFn {
  // We use the exact same logic for both the interface rep and the underlying rep

  return function $as<
    NEW_Q extends ObjectOrInterfaceDefinition,
  >(
    this: PantheonBase<any> & { [UnderlyingPantheonRecord]: any },
    targetMinDef: NEW_Q | string,
  ): PantheonBase<any> {
    let targetInterfaceApiName: string;

    if (typeof targetMinDef === "string") {
      if (targetMinDef === objDef.apiName) {
        return this[UnderlyingPantheonRecord];
      }

      // this is sufficient to determine if we implement the interface
      if (objDef.interfaceMap?.[targetMinDef] == null) {
        throw new Error(
          `Object does not implement interface '${targetMinDef}'.`,
        );
      }

      targetInterfaceApiName = targetMinDef;
    } else if (targetMinDef.apiName === objDef.apiName) {
      return this[UnderlyingPantheonRecord];
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

    const underlying = this[UnderlyingPantheonRecord];

    const existing = coachRecordToInterfaceView
      .get(underlying)
      .get(targetInterfaceApiName)?.deref();
    if (existing) return existing;

    const coachInterface = createPantheonInterface(underlying, def.def);
    coachRecordToInterfaceView.get(underlying).set(
      targetInterfaceApiName,
      new WeakRef(coachInterface),
    );
    return coachInterface;
  };
}
