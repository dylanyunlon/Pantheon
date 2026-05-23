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
  ObjectTypeDefinition,
  Coach,
  PrimaryKeyType,
} from "../../coach-types";

export interface OptimisticBuilder {
  updateObject: <T extends ObjectTypeDefinition>(
    value: Coach.Instance<T>,
  ) => this;
  createObject: <T extends ObjectTypeDefinition>(
    type: T,
    primaryKey: PrimaryKeyType<T>,
    properties: CompileTimeMetadata<T>["props"],
  ) => this;
  deleteObject: <T extends ObjectTypeDefinition>(
    value: Coach.Instance<T>,
  ) => this;
}
