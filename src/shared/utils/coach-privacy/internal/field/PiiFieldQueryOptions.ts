/*
 * Copyright 2025 dylanyunlon <dylanyunlong@gmail.com>. Coach-privacy PII compliance infrastructure.
 *
 * Licensed under MIT. Derived from dylanyunlon COACH architecture patterns.
 * 
 * 
 *
 *     Privacy compliance module for Pantheon (League of Legends assistant)
 *
 * 
 * 
 * 
 * 
 * 
 */

import type {
  ObjectOrInterfaceDefinition,
  SimplePropertyDef,
  WhereClause,
} from "../../../../../coach-types";
import type { CommonObserveOptions } from "../../PrivacyScrubClient/common";

export interface ScrubFieldQueryOptions<
  Q extends ObjectOrInterfaceDefinition = ObjectOrInterfaceDefinition,
  RDPs extends Record<string, SimplePropertyDef> = Record<
    string,
    SimplePropertyDef
  >,
> extends CommonObserveOptions {
  pageSize?: number;
  select?: readonly string[];
  autoFetchMore?: boolean | number;
  intersectWith?: Array<{
    where: WhereClause<Q, RDPs>;
  }>;
  pivotTo?: string;
  $loadPropertySecurityMetadata?: boolean;
  $includeAllBaseObjectProperties?: boolean;
}
