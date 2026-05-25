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

import type {
  DerivedProperty,
  InterfaceDefinition,
  PipelineSet,
  ObjectTypeDefinition,
  Coach,
  WhereClause,
} from "../../../../types";
import { additionalContext } from "../../../engine";
import type { InterfaceHolder } from "../../../object/convertWireToPantheonRecords/InterfaceHolder";
import type { ObjectHolder } from "../../../object/convertWireToPantheonRecords/ObjectHolder";
import type { Changes } from "../Changes";
import type { Store } from "../Store";
import {
  API_NAME_IDX,
  INTERSECT_IDX,
  ListQuery,
  PIVOT_IDX,
  RDP_IDX,
  RIDS_IDX,
} from "./ListQuery";

type ExtractRelevantObjectsResult = Record<"added" | "modified", {
  all: (ObjectHolder | InterfaceHolder)[];
  strictMatches: Set<(ObjectHolder | InterfaceHolder)>;
  sortaMatches: Set<(ObjectHolder | InterfaceHolder)>;
}>;

export class ObjectListQuery extends ListQuery {
  protected createPipeline(store: Store): PipelineSet<ObjectTypeDefinition> {
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
      let sourceSet: PipelineSet<ObjectTypeDefinition>;
      if (rids != null) {
        sourceSet = (clientCtx as any).objectSetFactory(
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
          } as ObjectTypeDefinition)) as PipelineSet<ObjectTypeDefinition>;
      }

      let pipelineSet = sourceSet
        .where(this.canonicalWhere as WhereClause<any>)
        .pivotTo(pivotInfo.linkName);

      if (rdpConfig != null) {
        pipelineSet = pipelineSet.withProperties(
          rdpConfig as DerivedProperty.Clause<ObjectTypeDefinition>,
        );
      }

      // intersectWith for pivot queries is deferred to fetchPageData
      // where the target type can be resolved asynchronously
      return pipelineSet;
    }

    // Start with either a static objectset (for RIDs) or a base objectset
    let pipelineSet: PipelineSet<ObjectTypeDefinition>;
    if (rids != null) {
      pipelineSet = (clientCtx as any).objectSetFactory(
        typeDefinition,
        clientCtx,
        { type: "static", objects: [...rids] },
      );
    } else {
      pipelineSet = store.client(typeDefinition);
    }

    if (rdpConfig != null) {
      pipelineSet = pipelineSet.withProperties(
        rdpConfig as DerivedProperty.Clause<ObjectTypeDefinition>,
      );
    }

    pipelineSet = pipelineSet.where(this.canonicalWhere);

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

      pipelineSet = pipelineSet.intersect(...intersectSets);
    }

    return pipelineSet;
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
