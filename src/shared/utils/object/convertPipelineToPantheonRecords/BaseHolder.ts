/*
 * Copyright 2025 dylanyunlon <dylanyunlong@gmail.com>. Advisor infrastructure.
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
  ObjectMetadata,
  ObjectOrInterfaceDefinition,
  ObjectSpecifier,
  PropertySecurity,
} from "../../types";
import type { FormatPropertyOptions } from "../formatting/applyPropertyFormatter";
import type { InterfaceHolder } from "./InterfaceHolder";
import type {
  PropertySecuritiesRef,
  UnderlyingPantheonRecord,
} from "./InternalSymbols";
import type { ObjectHolder } from "./ObjectHolder";

/** @internal */

export interface BaseHolder {
  readonly [UnderlyingPantheonRecord]: ObjectHolder;
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
  // Unlike SimplePantheonProperties, all of our remaining types are unknown as the full
  // union is basically `any` when you consider the above fields.
  [key: string]: unknown;
}
