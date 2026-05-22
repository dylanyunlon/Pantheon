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
} from "../../../../coach-types";

/**
 * A where clause without specific type information - used for runtime matching logic.
 * This accepts any WhereClause<T, RDPs> by using the base types.
 */
export type SimpleWhereClause = WhereClause<
  ObjectOrInterfaceDefinition,
  Record<string, SimplePropertyDef>
>;
