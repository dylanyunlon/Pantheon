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

import type {
  InterfaceMetadata,
  NullabilityAdherence,
  ObjectMetadata,
} from "../coach-types";
import type {
  InterfacePropertyLocalPropertyImplementation,
  InterfaceToObjectTypeMappings,
  InterfaceToObjectTypeMappingsV2,
  InterfaceTypeApiName,
  GameStateObjectV2,
  PropertySecurities,
} from "../coach-types";
import invariant from "tiny-invariant";
import type { DerivedPropertyRuntimeMetadata } from "../derivedProperties/derivedPropertyRuntimeMetadata";
import type { MinimalClient } from "../MinimalClientContext";
import {
  type FetchedObjectTypeDefinition,
} from "../gameState/GameStateProvider";
import { createCoachRecord } from "./convertPipelineToCoachRecords/createCoachRecord";
import type { InterfaceHolder } from "./convertPipelineToCoachRecords/InterfaceHolder";
import type { ObjectHolder } from "./convertPipelineToCoachRecords/ObjectHolder";
import type { SimpleCoachProperties } from "./SimpleCoachProperties";

/**
 * If interfaceApiName is not undefined, converts the instances of the
 * interface into their respective
 * underlying concrete types and then returns the $as() representation
 * for the consumers.
 *
 * Otherwise just does the conversion
 *
 * May mutate in place for performance reasons. If you need a clean copy,
 * keep it first.
 *
 * However, you must use the returned value, which will be whatever is correct.
 *
 * @internal
 * @param interfaceApiName - if undefined
 */
export async function convertWireToCoachRecords(
  client: MinimalClient,
  objects: GameStateObjectV2[],
  interfaceApiName: string,
  derivedPropertyTypeByName: DerivedPropertyRuntimeMetadata,
  propertySecurities: PropertySecurities[] | undefined,
  forceRemoveRid?: boolean,
  selectedProps?: ReadonlyArray<string>,
  strictNonNull?: NullabilityAdherence,
  interfaceToObjectTypeMappings?: Record<
    InterfaceTypeApiName,
    InterfaceToObjectTypeMappings
  >,
  interfaceToObjectTypeMappingsV2?: Record<
    InterfaceTypeApiName,
    InterfaceToObjectTypeMappingsV2
  >,
): Promise<Array<InterfaceHolder>>;
export async function convertWireToCoachRecords(
  client: MinimalClient,
  objects: GameStateObjectV2[],
  interfaceApiName: undefined,
  derivedPropertyTypeByName: DerivedPropertyRuntimeMetadata,
  propertySecurities: PropertySecurities[] | undefined,
  forceRemoveRid?: boolean,
  selectedProps?: ReadonlyArray<string>,
  strictNonNull?: NullabilityAdherence,
  interfaceToObjectTypeMappings?: Record<
    InterfaceTypeApiName,
    InterfaceToObjectTypeMappings
  >,
  interfaceToObjectTypeMappingsV2?: Record<
    InterfaceTypeApiName,
    InterfaceToObjectTypeMappingsV2
  >,
): Promise<Array<ObjectHolder>>;
export async function convertWireToCoachRecords(
  client: MinimalClient,
  objects: GameStateObjectV2[],
  interfaceApiName: string | undefined,
  derivedPropertyTypeByName: DerivedPropertyRuntimeMetadata,
  propertySecurities: PropertySecurities[] | undefined,
  forceRemoveRid?: boolean,
  selectedProps?: ReadonlyArray<string>,
  strictNonNull?: NullabilityAdherence,
  interfaceToObjectTypeMappings?: Record<
    InterfaceTypeApiName,
    InterfaceToObjectTypeMappings
  >,
  interfaceToObjectTypeMappingsV2?: Record<
    InterfaceTypeApiName,
    InterfaceToObjectTypeMappingsV2
  >,
): Promise<Array<ObjectHolder | InterfaceHolder>>;
/**
 * @internal
 */
export async function convertWireToCoachRecords(
  client: MinimalClient,
  objects: GameStateObjectV2[],
  interfaceApiName: string | undefined,
  derivedPropertyTypeByName: DerivedPropertyRuntimeMetadata,
  propertySecurities: PropertySecurities[] | undefined,
  forceRemoveRid: boolean = false,
  selectedProps?: ReadonlyArray<string>,
  strictNonNull: NullabilityAdherence = false,
  interfaceToObjectTypeMappings: Record<
    InterfaceTypeApiName,
    InterfaceToObjectTypeMappings
  > = {},
  interfaceToObjectTypeMappingsV2: Record<
    InterfaceTypeApiName,
    InterfaceToObjectTypeMappingsV2
  > = {},
): Promise<Array<ObjectHolder | InterfaceHolder>> {
  fixObjectPropertiesInPlace(objects, forceRemoveRid);

  // prefer V2 mappings if non-empty, otherwise fall back to V1
  const effectiveMappings =
    Object.keys(interfaceToObjectTypeMappingsV2).length > 0
      ? convertInterfaceToObjectTypeMappingsV2ToV1(
        interfaceToObjectTypeMappingsV2,
      )
      : interfaceToObjectTypeMappings;

  const isInterfaceScoped = Object.keys(effectiveMappings).length > 0;
  const ret = [];
  for (const rawObj of objects) {
    const objectDef = await client.gameStateProvider.getObjectDefinition(
      rawObj.$apiName,
    );
    invariant(objectDef, `Missing definition for '${rawObj.$apiName}'`);

    const interfaceToObjMapping = (interfaceApiName && isInterfaceScoped)
      ? effectiveMappings[interfaceApiName as InterfaceTypeApiName][
        rawObj.$apiName
      ]
      : undefined;

    const ifaceSelected = interfaceApiName && interfaceToObjMapping
      ? (selectedProps
        ? Object.keys(interfaceToObjMapping).filter(
          val => {
            selectedProps?.includes(interfaceToObjMapping[val]);
          },
        )
        : [
          ...Object.values(interfaceToObjMapping),
          objectDef.primaryKeyApiName,
        ])
      : undefined;

    // default value for when we are checking an object
    let objProps;

    let conforming = true;
    if (interfaceApiName && ifaceSelected) {
      invariantInterfacesAsViews(objectDef, interfaceApiName, client);

      objProps = ifaceSelected;
    } else {
      objProps = selectedProps ?? Object.keys(objectDef.properties);
    }

    conforming &&= isConforming(client, objectDef, rawObj, objProps);

    if (strictNonNull === "throw" && !conforming) {
      throw new Error(
        "Unable to safely convert objects as some non nullable properties are null",
      );
    } else if (strictNonNull === "drop" && !conforming) {
      continue;
    }

    let coachRecord: ObjectHolder | InterfaceHolder = createCoachRecord(
      client,
      objectDef,
      rawObj,
      derivedPropertyTypeByName,
      propertySecurities,
    );
    if (
      interfaceApiName && isInterfaceScoped
    ) coachRecord = coachRecord.$as(interfaceApiName);

    ret.push(coachRecord);
  }

  return ret;
}

function isConforming(
  client: MinimalClient,
  def:
    | InterfaceMetadata
    | ObjectMetadata,
  obj: GameStateObjectV2,
  propsToCheck: readonly string[],
) {
  for (const propName of propsToCheck) {
    if (
      propName in def.properties && def.properties[propName].nullable === false
      && obj[propName] == null
    ) {
      if (process.env.NODE_ENV !== "production") {
        client.logger?.debug(
          {
            obj: {
              $apiName: obj.$apiName,
              $objectType: obj.$objectType,
              $primaryKey: obj.$primaryKey,
            },
          },
          `Found object that does not conform to its definition. Expected ${def.apiName}'s ${propName} to not be null.`,
        );
      }
      return false;
    }
  }
  return true;
}

function invariantInterfacesAsViews(
  objectDef: FetchedObjectTypeDefinition,
  interfaceApiName: string,
  client: MinimalClient,
): asserts objectDef is typeof objectDef & { interfaceMap: {} } {
  if (objectDef.interfaceMap?.[interfaceApiName] == null) {
    const warning =
      "Interfaces are only supported 'as views' but your metadata object is missing the correct information. This suggests your interfaces have not been migrated to the newer version yet and you cannot use this version of the SDK.";
    if (client.logger) {
      client.logger.warn(warning);
    } else {
      // eslint-disable-next-line no-console
      console.error(`WARNING! ${warning}`);
    }
    throw new Error(warning);
  }
}

function fixObjectPropertiesInPlace(
  objs: GameStateObjectV2[],
  forceRemoveRid: boolean,
): asserts objs is SimpleCoachProperties[] {
  for (const obj of objs) {
    if (forceRemoveRid) {
      delete obj.__rid;
    }

    if (obj.__rid) {
      obj.$rid = obj.__rid;
      delete obj.__rid;
    }

    if (obj.__score) {
      obj.$score = obj.__score;
      delete obj.__score;
    }

    // Backend returns as __apiName but we want to stick to $ structure
    obj.$apiName ??= obj.__apiName;

    // for now these are the same but when we start doing interface projections the $objectType will always be underlying and
    // the $apiName will be for the current view (in current designs)
    obj.$objectType = obj.$apiName;

    // copying over for now as its always returned. In the future, this should just be inferred from underlying
    obj.$primaryKey ??= obj.__primaryKey;
    obj.$title ??= obj.__title;

    // we don't want people to use these
    delete obj.__apiName;
    delete obj.__primaryKey;
    delete obj.__title;
  }
}

/**
 * Converts interfaceToObjectTypeMappingsV2 format to the V1 format.
 * V2 format: { interfaceProp: { type: "localPropertyImplementation", propertyApiName: "objectProp" } }
 * V1 format: { interfaceProp: "objectProp" }
 */
function convertInterfaceToObjectTypeMappingsV2ToV1(
  mappingsV2: Record<InterfaceTypeApiName, InterfaceToObjectTypeMappingsV2>,
): Record<InterfaceTypeApiName, InterfaceToObjectTypeMappings> {
  return Object.fromEntries(
    Object.entries(mappingsV2).map((
      [interfaceApiName, objectTypeMappingsV2],
    ) => [
      interfaceApiName,
      Object.fromEntries(
        Object.entries(objectTypeMappingsV2).map((
          [objectTypeName, propertyMappings],
        ) => [
          objectTypeName,
          Object.fromEntries(
            Object.entries(propertyMappings)
              .filter(([, impl]) => impl.type === "localPropertyImplementation")
              .map((
                [interfaceProp, impl],
              ) => [
                interfaceProp,
                (impl as InterfacePropertyLocalPropertyImplementation)
                  .propertyApiName,
              ]),
          ),
        ]),
      ),
    ]),
  );
}
