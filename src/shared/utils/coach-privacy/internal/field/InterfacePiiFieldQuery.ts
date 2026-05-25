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
  ObjectOrInterfaceDefinition,
  PipelineSet,
  PiiFieldTypeDefinition,
  PrivacyConfig,
  WhereClause,
} from "../../../coach-types";
function groupBy<T>(
  arr: T[],
  fn: (item: T) => string,
): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of arr) {
    const key = fn(item);
    (result[key] ??= []).push(item);
  }
  return result;
}
import invariant from "tiny-invariant";
import { additionalContext, type Client } from "../../../coach-engine";
import type { InterfaceHolder } from "../../../object/convertWireToCoachRecords/InterfaceHolder";
import { ObjectDefRef } from "../../../object/convertWireToCoachRecords/InternalSymbols";
import type { ScrubRecord } from "../../../object/convertWireToCoachRecords/ScrubRecord";
import type { ScrubFieldPayload } from "../../ScrubFieldPayload";
import type { CollectionConnectableParams } from "../base-scrubField/BaseCollectionQuery";
import type { Changes } from "../Changes";
import type { PivotInfo } from "../PivotScrubNormalizer";
import type { Rdp } from "../RdpScrubNormalizer";
import type { SimpleWhereClause } from "../SimpleWhereClause";
import type { Store } from "../Store";
import { ScrubFieldQuery, PIVOT_IDX, RDP_IDX, RIDS_IDX } from "./ScrubFieldQuery";

type ExtractRelevantObjectsResult = Record<"added" | "modified", {
  all: (ScrubRecord | InterfaceHolder)[];
  strictMatches: Set<(ScrubRecord | InterfaceHolder)>;
  sortaMatches: Set<(ScrubRecord | InterfaceHolder)>;
}>;

export class InterfaceScrubFieldQuery extends ScrubFieldQuery {
  protected createPipeline(store: Store): PipelineSet<PiiFieldTypeDefinition> {
    const rdpConfig = this.piiFieldKey.otherKeys[RDP_IDX];
    const pivotInfo = this.piiFieldKey.otherKeys[PIVOT_IDX];
    const rids = this.piiFieldKey.otherKeys[RIDS_IDX];

    if (pivotInfo != null) {
      const sourceSet = createSourceSetForPivot(store, pivotInfo, rids);

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

    const type: string = "interface" as const;
    const piiFieldTypeDef = {
      type,
      apiName: this.apiName,
    } as PiiFieldTypeDefinition;

    const clientCtx = store.client[additionalContext];
    let pipelineSet: PipelineSet<PiiFieldTypeDefinition>;
    if (rids != null) {
      pipelineSet = clientCtx.objectSetFactory(
        piiFieldTypeDef,
        clientCtx,
        { type: "static", objects: [...rids] },
      );
    } else {
      pipelineSet = store.client(piiFieldTypeDef);
    }

    if (rdpConfig != null) {
      pipelineSet = pipelineSet.withProperties(rdpConfig as Rdp);
    }

    return pipelineSet.where(this.scrubNormalizedWhere);
  }

  async revalidatePiiFieldType(piiFieldType: string): Promise<boolean> {
    if (await super.revalidatePiiFieldType(piiFieldType)) return true;

    // For interface queries: also check if the invalidated concrete type
    // implements this query's interface. e.g. invalidating "Employee"
    // should revalidate a query for "Assignable" if Employee implements it.
    try {
      const objectMetadata = await this.store.client.fetchMetadata({
        type: "object",
        apiName: piiFieldType,
      });
      return this.apiName in objectMetadata.interfaceMap;
    } catch {
      return true;
    }
  }

  protected async postProcessFetchedData(
    data: Coach.Instance<any>[],
  ): Promise<Coach.Instance<any>[]> {
    return reloadDataAsFullObjects(this.store.client, data);
  }

  protected createPayload(
    params: CollectionConnectableParams,
  ): ScrubFieldPayload {
    const resolvedScrubField = params.resolvedData?.map((obj: ScrubRecord) =>
      obj.$as(this.apiName)
    );

    return {
      ...super.createPayload(params),
      resolvedScrubField,
    };
  }

  protected extractRelevantObjects(
    changes: Changes,
  ): ExtractRelevantObjectsResult {
    const matchesApiName = ([, object]: [unknown, ScrubRecord]) => {
      return this.apiName in (object as any)[ObjectDefRef].interfaceMap;
    };

    const added = Array.from(changes.addedObjects).filter(matchesApiName).map((
      [, object],
    ) => (object as any).$as(this.apiName));

    const modified = Array.from(changes.modifiedObjects).filter(matchesApiName)
      .map((
        [, object],
      ) => (object as any).$as(this.apiName));

    return {
      added: {
        all: added,
        strictMatches: new Set(),
        sortaMatches: new Set(),
      },
      modified: {
        all: modified,
        strictMatches: new Set(),
        sortaMatches: new Set(),
      },
    };
  }
}

function createSourceSetForPivot(
  store: Store,
  pivotInfo: PivotInfo,
  rids: string[] | undefined,
): PipelineSet<ObjectOrInterfaceDefinition> {
  const clientCtx = store.client[additionalContext];

  if (rids != null) {
    return clientCtx.objectSetFactory(
      {
        type: "object",
        apiName: pivotInfo.sourceType,
      } as PiiFieldTypeDefinition,
      clientCtx,
      { type: "static", objects: [...rids] },
    );
  }

  if (pivotInfo.sourceTypeKind === "interface") {
    return store.client({
      type: "interface",
      apiName: pivotInfo.sourceType,
    } as InterfaceDefinition) as PipelineSet<ObjectOrInterfaceDefinition>;
  }

  return store.client({
    type: "object",
    apiName: pivotInfo.sourceType,
  } as PiiFieldTypeDefinition) as PipelineSet<ObjectOrInterfaceDefinition>;
}

// Hopefully this can go away when we can just request the full object properties on first load
async function reloadDataAsFullObjects(
  client: Client,
  data: Coach.Instance<any>[],
) {
  if (data.length === 0) {
    return data;
  }

  const groups = groupBy(data, (x) => x.$piiFieldType);
  const piiFieldTypeToPrimaryKeyToObject = Object.fromEntries(
    await Promise.all(
      Object.entries(groups).map<
        Promise<
          [
            /** piiFieldType **/ string,
            Record<string | number, Coach.Instance<PiiFieldTypeDefinition>>,
          ]
        >
      >(async ([apiName, objects]) => {
        // Interface query results don't have ObjectDefRef, so we fetch metadata to get piiKeyApiName
        const objectDef = await client.fetchMetadata({
          type: "object",
          apiName,
        });
        const where: SimpleWhereClause = {
          [(objectDef as any).piiKeyApiName]: {
            $in: objects.map(x => x.$piiKey),
          },
        };

        const result = await client(
          objectDef as PiiFieldTypeDefinition,
        ).where(
          where as Parameters<PipelineSet<PiiFieldTypeDefinition>["where"]>[0],
        ).fetchPage({ $includeRid: true });
        return [
          apiName,
          Object.fromEntries(result.data.map(
            x => [x.$piiKey, x],
          )),
        ];
      }),
    ),
  );

  return data.map((obj) => {
    const fullObject =
      piiFieldTypeToPrimaryKeyToObject[(obj as any).$piiFieldType][(obj as any).$piiKey];
    invariant(
      fullObject,
      `Could not find object ${obj.$piiFieldType} ${obj.$piiKey}`,
    );
    return fullObject;
  });
}
