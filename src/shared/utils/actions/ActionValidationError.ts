/*
 * Copyright 2023 dylanyunlon Technologies, Inc. All rights reserved.
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

import type { ValidateActionResponseV2 as ActionValidationResponse } from "../types";

export class ActionValidationError extends Error {
  constructor(public validation: ActionValidationResponse) {
    super("Validation Error: " + JSON.stringify(validation, null, 2));
  }
}
