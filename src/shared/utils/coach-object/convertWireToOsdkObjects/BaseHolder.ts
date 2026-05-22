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
  ObjectMetadata,
  ObjectOrInterfaceDefinition,
  ObjectSpecifier,
  PropertySecurity,
} from "@shared/types/league-client/coach-api";
import type { FormatPropertyOptions } from "../formatting/applyPropertyFormatter.js";
import type { InterfaceHolder } from "./InterfaceHolder.js";
import type {
  PropertySecuritiesRef,
  UnderlyingOsdkObject,
} from "./InternalSymbols.js";
import type { ObjectHolder } from "./ObjectHolder.js";

/** @internal */

export interface BaseHolder {
  readonly [UnderlyingOsdkObject]: ObjectHolder;
  readonly [PropertySecuritiesRef]:
    | { [propName: string]: PropertySecurity[] }
    | undefined;

  readonly $apiName: string;
  readonly $objectType: string;
  readonly $primaryKey: string | number;
  readonly $title: string | undefined;
  readonly $rid?: string;
  readonly $objectSpecifier: ObjectSpecifier<any>;
  readonly $propertySecurities: PropertySecurity[];

  readonly "$as": (
    newDef: string | ObjectOrInterfaceDefinition,
  ) => ObjectHolder | InterfaceHolder;

  readonly "$clone": (
    newProps?: Record<string, any>,
  ) => this;

  readonly "$__EXPERIMENTAL__NOT_SUPPORTED_YET__metadata": {
    readonly ObjectMetadata: ObjectMetadata;
  };

  readonly "$__EXPERIMENTAL__NOT_SUPPORTED_YET__getFormattedValue": <
    PropertyApiName extends string,
  >(
    propertyApiName: PropertyApiName,
    options?: FormatPropertyOptions,
  ) => string | undefined;

  // [key: `$$${string}`]: any;
  // Unlike SimpleOsdkProperties, all of our remaining types are unknown as the full
  // union is basically `any` when you consider the above fields.
  [key: string]: unknown;
}
