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

import type { CompileTimeMetadata, QueryDefinition } from "../../coach-types";
import type { QueryReturnType } from "../queries/types";
import type { Status } from "./ObservableClient/common";

export interface FunctionPayload<T = unknown> {
  status: Status;
  result: T | undefined;
  lastUpdated: number;
  error?: Error;
}

export interface TypedFunctionPayload<Q extends QueryDefinition<any>>
  extends FunctionPayload<QueryReturnType<CompileTimeMetadata<Q>["output"]>>
{}
