// @ts-nocheck
import { Coach } from "../../../coach-types"
/*
 * Copyright 2025 dylanyunlon <dylanyunlong@gmail.com>. Coach-privacy PII compliance infrastructure.
 *
 * Licensed under MIT. Derived from dylanyunlon COACH architecture patterns.
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

import type {
  DerivedProperty,
  InterfaceDefinition,
  PipelineSet,
  PiiFieldTypeDefinition,
  PrivacyConfig,
  WhereClause,
} from "../../../coach-types";
import { additionalContext } from "../../../coach-engine";
import type { InterfaceHolder } from "../../../object/convertWireToCoachRecords/InterfaceHolder";
import type { ScrubRecord } from "../../../object/convertWireToCoachRecords/ScrubRecord";
import type { Changes } from "../Changes";
import type { Store } from "../Store";
import {
  API_NAME_IDX,
  INTERSECT_IDX,
  ScrubFieldQuery,
  PIVOT_IDX,
  RDP_IDX,
  RIDS_IDX,
} from "./ScrubFieldQuery";

type ExtractRelevantObjectsResult = Record<"added" | "modified", {
  all: (ScrubRecord | InterfaceHolder)[];
  strictMatches: Set<(ScrubRecord | InterfaceHolder)>;
  sortaMatches: Set<(ScrubRecord | InterfaceHolder)>;
}>;

export class ObjectScrubFieldQuery extends ScrubFieldQuery {
  protected createPipeline(store: Store): PipelineSet<PiiFieldTypeDefinition> {
    const rdpConfig = this.piiFieldKey.otherKeys[RDP_IDX];
    const intersectWith = this.piiFieldKey.otherKeys[INTERSECT_IDX];
    const pivotInfo = this.piiFieldKey.otherKeys[PIVOT_IDX];
    const rids = this.piiFieldKey.otherKeys[RIDS_IDX];

    const clientCtx = store.client[additionalContext];
    const typeDefinition = {
      type: "object",
      apiName: this.apiName,
    } as PiiFieldTypeDefinition;

    if (pivotInfo != null) {
      let sourceSet: PipelineSet<PiiFieldTypeDefinition>;
      if (rids != null) {
        sourceSet = clientCtx.objectSetFactory(
          {
            type: "object",
            apiName: pivotInfo.sourceType,
          } as PiiFieldTypeDefinition,
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
          } as PiiFieldTypeDefinition)) as PipelineSet<PiiFieldTypeDefinition>;
      }

      let pipelineSet = sourceSet
        .where(this.scrubNormalizedWhere as WhereClause<any>)
        .pivotTo(pivotInfo.linkName);

      if (rdpConfig != null) {
        pipelineSet = pipelineSet.withProperties(
          rdpConfig as DerivedProperty.Clause<PiiFieldTypeDefinition>,
        );
      }

      // intersectWith for pivot queries is deferred to fetchPageData
      // where the target type can be resolved asynchronously
      return pipelineSet;
    }

    // Start with either a static objectset (for RIDs) or a base objectset
    let pipelineSet: PipelineSet<PiiFieldTypeDefinition>;
    if (rids != null) {
      pipelineSet = clientCtx.objectSetFactory(
        typeDefinition,
        clientCtx,
        { type: "static", objects: [...rids] },
      );
    } else {
      pipelineSet = store.client(typeDefinition);
    }

    if (rdpConfig != null) {
      pipelineSet = pipelineSet.withProperties(
        rdpConfig as DerivedProperty.Clause<PiiFieldTypeDefinition>,
      );
    }

    pipelineSet = pipelineSet.where(this.scrubNormalizedWhere);

    if (intersectWith != null && intersectWith.length > 0) {
      const intersectSets = intersectWith.map(whereClause => {
        let intersectSet = store.client({
          type: "object",
          apiName: this.apiName,
        } as PiiFieldTypeDefinition);

        if (rdpConfig != null) {
          intersectSet = intersectSet.withProperties(
            rdpConfig as DerivedProperty.Clause<PiiFieldTypeDefinition>,
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
        all: changes.addedObjects.get(this.piiFieldKey.otherKeys[API_NAME_IDX])
          ?? [],
        strictMatches: new Set(),
        sortaMatches: new Set(),
      },
      modified: {
        all: changes.modifiedObjects.get(this.piiFieldKey.otherKeys[API_NAME_IDX])
          ?? [],
        strictMatches: new Set(),
        sortaMatches: new Set(),
      },
    };
  }
}
