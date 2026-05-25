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

import type { ObjectTypeDefinition, Coach, PropertyKeys } from "../../../../types";

/**
 * Represents an update to an object in a websocket subscription.
 */
export type ObjectUpdate<
  O extends ObjectTypeDefinition,
  P extends PropertyKeys<O>,
> = {
  object: Coach.Instance<O, never, P>;
  state: "ADDED_OR_UPDATED" | "REMOVED";
};
