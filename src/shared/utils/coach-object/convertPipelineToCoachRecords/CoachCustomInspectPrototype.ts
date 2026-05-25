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

import type { ObjectOrInterfaceDefinition, Coach } from "../../coach-types";
import type { inspect, InspectOptionsStylized } from "node:util";
import type { HolderBase } from "./InternalSymbols";
import {
  InterfaceDefRef,
  ObjectDefRef,
  UnderlyingCoachRecord,
} from "./InternalSymbols";

const nodejsUtilInspectCustom: unique symbol = Symbol.for(
  "nodejs.util.inspect.custom",
);

export const CoachCustomInspectPrototype: {
  [nodejsUtilInspectCustom]: typeof customInspect;
} = Object.create(null, {
  [nodejsUtilInspectCustom]: { value: customInspect },
});

/**
 * A custom `util.inspect`/`console.log` for nodejs. Not emitted in the browser version
 * @param this
 * @param _depth
 * @param options
 * @param inspect
 * @returns
 */
function customInspect(
  this:
    & HolderBase<ObjectOrInterfaceDefinition>
    & Coach.Instance<any>,
  _depth: number,
  options: InspectOptionsStylized,
  localInspect: typeof inspect,
): string {
  const newOptions = {
    ...options,
    depth: options.depth == null ? null : options.depth - 1,
  };

  let ret = `Coach<${
    options.stylize(
      this[ObjectDefRef]?.apiName ?? this[InterfaceDefRef]?.apiName ?? "",
      "special",
    )
  }> {\n`;

  for (
    const k of new Set([
      "$apiName",
      "$objectType",
      "$primaryKey",
      ...Reflect.ownKeys(this),
    ])
  ) {
    if (typeof k === "symbol") continue;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-conversion
    ret += `  ${options.stylize(k.toString(), "undefined")}: ${
      localInspect(this[k as any], newOptions)
    }\n`;
  }

  if (this[UnderlyingCoachRecord] !== this) {
    ret += "\n";
    ret += `  ${options.stylize("$as", "special")}: ${
      localInspect(this[UnderlyingCoachRecord], newOptions).replace(
        /\n/g,
        `\n  `,
      )
    }`;
    ret += "\n";
  }

  ret += "}";
  return ret;
}
