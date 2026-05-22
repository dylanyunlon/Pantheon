/*
 * Copyright 2023 dylanyunlon Technologies, Inc. All rights reserved.
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

import type { ValidateActionResponseV2 as ActionValidationResponse } from "../coach-types";

export class ActionValidationError extends Error {
  constructor(public validation: ActionValidationResponse) {
    super("Validation Error: " + JSON.stringify(validation, null, 2));
  }
}
