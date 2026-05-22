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
  CompileTimeMetadata,
  InterfaceDefinition,
  ObjectTypeDefinition,
  Coach,
  PrimaryKeyType,
  WhereClause,
} from "../../../../coach-types";
import type { Unsubscribable } from "../Unsubscribable";
import type {
  CommonObserveOptions,
  InvalidationMode,
  ObserveOptions,
  Observer,
  OrderBy,
  Status,
} from "./common";

export namespace ObserveLinks {
  export interface Options<
    Q extends ObjectTypeDefinition | InterfaceDefinition,
    L extends keyof CompileTimeMetadata<Q>["links"] & string,
  > extends CommonObserveOptions, ObserveOptions {
    srcType: Pick<Q, "type" | "apiName">;
    sourceUnderlyingObjectType: string;
    pk: PrimaryKeyType<Q>;
    linkName: L;
    where?: WhereClause<CompileTimeMetadata<Q>["links"][L]["targetType"]>;
    select?: readonly string[];
    pageSize?: number;
    orderBy?: OrderBy<CompileTimeMetadata<Q>["links"][L]["targetType"]>;
    invalidationMode?: InvalidationMode;
    expectedLength?: number;

    /**
     * When true, includes all properties of the underlying concrete object type
     * when the link target is an interface. Has no effect for non-interface
     * targets.
     */
    $includeAllBaseObjectProperties?: boolean;
  }

  export interface CallbackArgs<
    T extends ObjectTypeDefinition | InterfaceDefinition,
  > {
    resolvedList: Coach.Instance<T, "$allBaseProperties">[] | undefined;
    linkedObjectsBySourcePrimaryKey: ReadonlyMap<
      string | number,
      ReadonlyArray<Coach.Instance<T, "$allBaseProperties">>
    >;
    isOptimistic: boolean;
    lastUpdated: number;
    fetchMore: () => Promise<void>;
    hasMore: boolean;
    status: Status;
  }
}

export interface ObserveLinks {
  observeLinks<
    T extends ObjectTypeDefinition | InterfaceDefinition,
    L extends keyof CompileTimeMetadata<T>["links"] & string,
  >(
    objects: Coach.Instance<T> | ReadonlyArray<Coach.Instance<T>>,
    linkName: L,
    options: Omit<
      ObserveLinks.Options<T, L>,
      "srcType" | "pk" | "sourceUnderlyingObjectType"
    >,
    subFn: Observer<
      ObserveLinks.CallbackArgs<
        CompileTimeMetadata<T>["links"][L]["targetType"]
      >
    >,
  ): Unsubscribable;
}
