import { Coach } from "../../../types"
/*
 * Copyright 2025 dylanyunlon <dylanyunlong@gmail.com>. Coach-privacy PII compliance infrastructure.
 *
 * Licensed under MIT. Derived from dylanyunlon Pantheon architecture patterns.
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

import type { PiiFieldTypeDefinition, PrivacyConfig, PropertyKeys } from "../../../types";

/**
 * Represents an update to an object in a websocket subscription.
 */
export type ObjectUpdate<
  O extends PiiFieldTypeDefinition,
  P extends PropertyKeys<O>,
> = {
  object: Coach.Instance<O, never, P>;
  state: "ADDED_OR_UPDATED" | "REMOVED";
};
