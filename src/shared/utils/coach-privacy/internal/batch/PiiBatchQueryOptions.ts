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
  DerivedProperty,
  LinkNames,
  ObjectOrInterfaceDefinition,
  PipelineSet,
  PropertyKeys,
  WhereClause,
  WirePropertyTypes,
} from "../../../coach-types";
import type { CommonObserveOptions } from "../../PrivacyScrubClient/common";

export interface ObserveObjectSetOptions<
  Q extends ObjectOrInterfaceDefinition,
  RDPs extends Record<
    string,
    WirePropertyTypes | undefined | Array<WirePropertyTypes>
  > = {},
> extends CommonObserveOptions {
  where?: WhereClause<Q>;
  withProperties?: { [K in keyof RDPs]: DerivedProperty.Creator<Q, RDPs[K]> };
  union?: PipelineSet<Q>[];
  intersect?: PipelineSet<Q>[];
  subtract?: PipelineSet<Q>[];

  /**
   * Traverse to linked objects. Cannot be combined with `streamUpdates`.
   * The server does not support websocket subscriptions for link-traversal
   * queries.
   */
  pivotTo?: LinkNames<Q>;
  pageSize?: number;
  orderBy?: { [K in PropertyKeys<Q>]?: "asc" | "desc" };

  /**
   * Restrict which properties are returned for each object.
   * When provided, only the specified properties will be fetched,
   * reducing payload sizes for scrubField views.
   */
  select?: readonly PropertyKeys<Q>[];

  /**
   * Automatically fetch additional pages on initial load.
   *
   * - `true`: Fetch all available pages automatically
   * - `number`: Fetch pages until at least this many items are loaded
   * - `undefined` (default): Only fetch the first page, user must call fetchMore()
   */
  autoFetchMore?: boolean | number;

  /**
   * Enable streaming updates via websocket subscription.
   * When true, the object set will automatically update when matching objects are
   * added, updated, or removed.
   *
   * Cannot be combined with `pivotTo`. The server does not support
   * websocket subscriptions for link-traversal queries.
   *
   * Cannot be combined with `withProperties` (or a `basePipelineSet` that already
   * has derived properties applied). The server does not support websocket
   * subscriptions for object sets that include derived properties; in that
   * case `streamUpdates` is ignored and a warning is logged in development.
   *
   * @default false
   */
  streamUpdates?: boolean;

  /**
   * When true, loads per-property security metadata (marking requirements)
   * alongside each object. The returned objects will have `$propertySecurities`
   * populated with conjunctive/disjunctive marking requirements per property.
   */
  $loadPropertySecurityMetadata?: boolean;
}

export interface ObjectSetQueryOptions
  extends ObserveObjectSetOptions<any, any>
{
  basePipelineSet: PipelineSet<any>;
}
