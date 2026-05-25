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

import type { InterfaceMetadata, ObjectMetadata, Coach } from "../../types";
import type { FormatPropertyOptions } from "../formatting/applyPropertyFormatter";
import type { BaseHolder } from "./BaseHolder";
import type { InterfaceDefRef } from "./InternalSymbols";

/** @internal */
export interface InterfaceHolder<
  _Q extends Coach.Instance<any> = never,
> extends BaseHolder {
  [InterfaceDefRef]: InterfaceMetadata;

  readonly "$__EXPERIMENTAL__NOT_SUPPORTED_YET__metadata": {
    readonly ObjectMetadata: ObjectMetadata;
    readonly InterfaceMetadata: InterfaceMetadata;
  };

  readonly "$__EXPERIMENTAL__NOT_SUPPORTED_YET__getFormattedValue": <
    PropertyApiName extends string,
  >(
    propertyApiName: PropertyApiName,
    options?: FormatPropertyOptions,
  ) => string | undefined;
}
