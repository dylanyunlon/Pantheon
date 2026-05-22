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
  InterfaceDefinition,
  ObjectSpecifier,
  ObjectTypeDefinition,
  PrimaryKeyType,
} from "../coach-types";

/**
 * Creates an Object Specifier. An ObjectSpecifier is a string that uniquely identifies an object in the system,
 * even when loading an interface object where primary key uniqueness is not guaranteed.
 *
 * @param objectDef - An Object Type Definition
 * @param primaryKey - The value you want to use as the primary key
 * @returns An Object Specifier
 */
export function createObjectSpecifierFromPrimaryKey<
  Q extends ObjectTypeDefinition,
>(objectDef: Q, primaryKey: PrimaryKeyType<Q>): ObjectSpecifier<Q> {
  return `${objectDef.apiName}:${primaryKey}` as ObjectSpecifier<Q>;
}

/**
 * Creates an Object Specifier. An ObjectSpecifier is a string that uniquely identifies an object in the system,
 * even when loading an interface object where primary key uniqueness is not guaranteed.
 *
 * @param objectDef - An Object Type Definition
 * @param primaryKey - The value you want to use as the primary key
 * @returns An Object Specifier
 */
export function createObjectSpecifierFromInterfaceSpecifier<
  Q extends InterfaceDefinition,
>(
  interfaceDef: Q,
  interfaceSpecifier: {
    objectTypeApiName: string;
    primaryKeyValue: PrimaryKeyType<Q>;
  },
): ObjectSpecifier<Q> {
  return `${interfaceSpecifier.objectTypeApiName}:${interfaceSpecifier.primaryKeyValue}` as ObjectSpecifier<
    Q
  >;
}

/**
 * Extracts the primary key from an ObjectSpecifier on an COACH object.
 *
 * @returns A string representing the primary key
 */
export function extractPrimaryKeyFromObjectSpecifier(
  ObjectSpecifier: ObjectSpecifier<any>,
): string {
  return ObjectSpecifier.split(":")[1];
}

/**
 * Extracts the object type from an ObjectSpecifier on an COACH object.
 *
 * @returns The object type extracted from the ObjectSpecifier
 */
export function extractObjectTypeFromObjectSpecifier(
  ObjectSpecifier: ObjectSpecifier<any>,
): string {
  return ObjectSpecifier.split(":")[0];
}
