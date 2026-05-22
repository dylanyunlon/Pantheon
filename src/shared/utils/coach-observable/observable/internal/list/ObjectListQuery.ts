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
  DerivedProperty,
  InterfaceDefinition,
  ObjectSet,
  ObjectTypeDefinition,
  Coach,
  WhereClause,
} from "@shared/types/league-client/coach-api";
import { additionalContext } from "../../../Client.js";
import type { InterfaceHolder } from "../../../object/convertWireToOsdkObjects/InterfaceHolder.js";
import type { ObjectHolder } from "../../../object/convertWireToOsdkObjects/ObjectHolder.js";
import type { Changes } from "../Changes.js";
import type { Store } from "../Store.js";
import {
  API_NAME_IDX,
  INTERSECT_IDX,
  ListQuery,
  PIVOT_IDX,
  RDP_IDX,
  RIDS_IDX,
} from "./ListQuery.js";

type ExtractRelevantObjectsResult = Record<"added" | "modified", {
  all: (ObjectHolder | InterfaceHolder)[];
  strictMatches: Set<(ObjectHolder | InterfaceHolder)>;
  sortaMatches: Set<(ObjectHolder | InterfaceHolder)>;
}>;

export class ObjectListQuery extends ListQuery {
  protected createObjectSet(store: Store): ObjectSet<ObjectTypeDefinition> {
    const rdpConfig = this.cacheKey.otherKeys[RDP_IDX];
    const intersectWith = this.cacheKey.otherKeys[INTERSECT_IDX];
    const pivotInfo = this.cacheKey.otherKeys[PIVOT_IDX];
    const rids = this.cacheKey.otherKeys[RIDS_IDX];

    const clientCtx = store.client[additionalContext];
    const typeDefinition = {
      type: "object",
      apiName: this.apiName,
    } as ObjectTypeDefinition;

    if (pivotInfo != null) {
      let sourceSet: ObjectSet<ObjectTypeDefinition>;
      if (rids != null) {
        sourceSet = clientCtx.objectSetFactory(
          {
            type: "object",
            apiName: pivotInfo.sourceType,
          } as ObjectTypeDefinition,
          clientCtx,
          { type: "static", objects: [...rids] },
        );
      } else {
        sourceSet = (pivotInfo.sourceTypeKind === "interface"
          ? store.client({
            type: "interface",
            apiName: pivotInfo.sourceType,
          } as InterfaceDefinition)
          : store.client({
            type: "object",
            apiName: pivotInfo.sourceType,
          } as ObjectTypeDefinition)) as ObjectSet<ObjectTypeDefinition>;
      }

      let objectSet = sourceSet
        .where(this.canonicalWhere as WhereClause<any>)
        .pivotTo(pivotInfo.linkName);

      if (rdpConfig != null) {
        objectSet = objectSet.withProperties(
          rdpConfig as DerivedProperty.Clause<ObjectTypeDefinition>,
        );
      }

      // intersectWith for pivot queries is deferred to fetchPageData
      // where the target type can be resolved asynchronously
      return objectSet;
    }

    // Start with either a static objectset (for RIDs) or a base objectset
    let objectSet: ObjectSet<ObjectTypeDefinition>;
    if (rids != null) {
      objectSet = clientCtx.objectSetFactory(
        typeDefinition,
        clientCtx,
        { type: "static", objects: [...rids] },
      );
    } else {
      objectSet = store.client(typeDefinition);
    }

    if (rdpConfig != null) {
      objectSet = objectSet.withProperties(
        rdpConfig as DerivedProperty.Clause<ObjectTypeDefinition>,
      );
    }

    objectSet = objectSet.where(this.canonicalWhere);

    if (intersectWith != null && intersectWith.length > 0) {
      const intersectSets = intersectWith.map(whereClause => {
        let intersectSet = store.client({
          type: "object",
          apiName: this.apiName,
        } as ObjectTypeDefinition);

        if (rdpConfig != null) {
          intersectSet = intersectSet.withProperties(
            rdpConfig as DerivedProperty.Clause<ObjectTypeDefinition>,
          );
        }

        return intersectSet.where(whereClause);
      });

      objectSet = objectSet.intersect(...intersectSets);
    }

    return objectSet;
  }

  protected postProcessFetchedData(
    data: Coach.Instance<any>[],
  ): Promise<Coach.Instance<any>[]> {
    return Promise.resolve(data);
  }

  protected extractRelevantObjects(
    changes: Changes,
  ): ExtractRelevantObjectsResult {
    return {
      added: {
        all: changes.addedObjects.get(this.cacheKey.otherKeys[API_NAME_IDX])
          ?? [],
        strictMatches: new Set(),
        sortaMatches: new Set(),
      },
      modified: {
        all: changes.modifiedObjects.get(this.cacheKey.otherKeys[API_NAME_IDX])
          ?? [],
        strictMatches: new Set(),
        sortaMatches: new Set(),
      },
    };
  }
}
