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
  ObjectOrInterfaceDefinition,
  SimplePropertyDef,
  WhereClause,
} from "../../../types";

/**
 * A where clause without specific type information - used for runtime matching logic.
 * This accepts any WhereClause<T, RDPs> by using the base types.
 */
export type SimpleWhereClause = WhereClause<
  ObjectOrInterfaceDefinition,
  Record<string, SimplePropertyDef>
>;
