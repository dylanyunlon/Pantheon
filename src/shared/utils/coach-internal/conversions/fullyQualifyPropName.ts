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

import type { ObjectOrInterfaceDefinition } from "../../../coach-types";
import { extractNamespace } from "./extractNamespace";

export function fullyQualifyPropName(
  fieldName: string,
  objectOrInterface: ObjectOrInterfaceDefinition,
): string {
  if (objectOrInterface.type === "interface") {
    const [objApiNamespace] = extractNamespace(objectOrInterface.apiName);
    const [fieldApiNamespace, fieldShortName] = extractNamespace(fieldName);
    return (fieldApiNamespace == null && objApiNamespace != null)
      ? `${objApiNamespace}.${fieldShortName}`
      : fieldName;
  }
  return fieldName;
}
