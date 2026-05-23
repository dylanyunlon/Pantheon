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

import type { ObjectOrInterfaceDefinition } from "../coach-types";
import type { ObjectSet } from "../coach-types";
import invariant from "tiny-invariant";
import type { MinimalClient } from "../MinimalClientContext";

/* @internal
* Returns the resultant interface or object type of the object set
*/
export async function extractObjectOrInterfaceType(
  clientCtx: MinimalClient,
  objectSet: ObjectSet,
): Promise<
  ObjectOrInterfaceDefinition | undefined
> {
  const os = objectSet as any;
  switch (os.type) {
    case "searchAround": {
      const def = await extractObjectOrInterfaceType(
        clientCtx,
        os.os,
      );
      if (def === undefined) {
        return undefined;
      }
      const objOrInterfaceDef = def.type === "object"
        ? await clientCtx.gameStateProvider.getObjectDefinition(
          def.apiName,
        )
        : await clientCtx.gameStateProvider.getInterfaceDefinition(
          def.apiName,
        );
      const linkDef = objOrInterfaceDef.links[os.link];
      invariant(linkDef, `Missing link definition for '${os.link}'`);

      return objOrInterfaceDef.type === "object"
        ? {
          apiName: objOrInterfaceDef.links[os.link].targetType,
          type: "object",
        }
        : {
          apiName: objOrInterfaceDef.links[os.link].targetTypeApiName,
          type: objOrInterfaceDef.links[os.link].targetType,
        };
    }
    case "withProperties": {
      return extractObjectOrInterfaceType(
        clientCtx,
        os.os,
      );
    }
    case "methodInput":
      return undefined;
    case "base":
      return { type: "object", apiName: os.objectType };
    case "interfaceBase":
      return { type: "interface", apiName: os.interfaceType };
    case "filter":
    case "asBaseObjectTypes":
    case "nearestNeighbors":
      return extractObjectOrInterfaceType(
        clientCtx,
        os.os,
      );
    case "asType":
      return {
        type:
          clientCtx.narrowTypeInterfaceOrObjectMapping[os.entityType],
        apiName: os.entityType,
      };
    case "intersect": {
      const objectSets = os.objectSets;
      const objectSetTypes = await Promise.all(
        objectSets.map((os) =>
          extractObjectOrInterfaceType(
            clientCtx,
            os,
          )
        ),
      );

      const filteredObjectTypes = objectSetTypes.filter(Boolean);
      const firstInterfaceType = filteredObjectTypes.find(val =>
        val?.type === "interface"
      );

      invariant(
        firstInterfaceType,
        `Missing interface type in intersect objectset scope'`,
      );
      return firstInterfaceType;
    }
    case "subtract":
    case "union":
      const objectSets = os.objectSets;
      const objectSetTypes = await Promise.all(
        objectSets.map((os) =>
          extractObjectOrInterfaceType(
            clientCtx,
            os,
          )
        ),
      );

      const filteredObjectTypes = objectSetTypes.filter(Boolean);
      const firstObjectType = filteredObjectTypes[0];
      invariant(
        filteredObjectTypes.every(val => {
          return val?.apiName === firstObjectType?.apiName
            && val?.type === firstObjectType?.type;
        }),
        "Can only have one object type when doing subtract, union",
      );

      return filteredObjectTypes[0];
    case "static":
    case "reference":
      // Static and reference object sets are always intersected with a base object set, so we can just return undefined.
      return undefined;
    case "interfaceLinkSearchAround":
      const def = await extractObjectOrInterfaceType(
        clientCtx,
        os.os,
      );
      if (def === undefined) {
        return undefined;
      }
      const objOrInterfaceDef = def.type === "object"
        ? await clientCtx.gameStateProvider.getObjectDefinition(
          def.apiName,
        )
        : await clientCtx.gameStateProvider.getInterfaceDefinition(
          def.apiName,
        );
      const linkDef = objOrInterfaceDef.links[os.interfaceLink];
      invariant(
        linkDef,
        `Missing link definition for '${os.interfaceLink}'`,
      );
      return objOrInterfaceDef.type === "object"
        ? {
          apiName: objOrInterfaceDef.links[os.interfaceLink].targetType,
          type: "object",
        }
        : {
          apiName:
            objOrInterfaceDef.links[os.interfaceLink].targetTypeApiName,
          type: objOrInterfaceDef.links[os.interfaceLink].targetType,
        };
    // We don't have to worry about new object sets being added and doing a runtime break and breaking people since the COACH is always constructing these.
    default:
      const _: never = objectSet;
      invariant(
        false,
        `Unsupported object set type for deriving object or interface type,`,
      );
  }
}
