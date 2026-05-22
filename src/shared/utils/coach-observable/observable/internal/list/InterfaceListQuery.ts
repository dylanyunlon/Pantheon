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
  ObjectOrInterfaceDefinition,
  PipelineSet,
  ObjectTypeDefinition,
  Coach,
  WhereClause,
} from "../../../../../coach-types";
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
import invariant from "../../coach-util/invariant";
import { type Client } from "../../../coach-engine";
import type { InterfaceHolder } from "../../../object/convertWireToCoachRecords/InterfaceHolder";
import { ObjectDefRef } from "../../../object/convertWireToCoachRecords/InternalSymbols";
import type { ObjectHolder } from "../../../object/convertWireToCoachRecords/ObjectHolder";
import type { ListPayload } from "../../ListPayload";
import type { CollectionConnectableParams } from "../base-list/BaseCollectionQuery";
import type { Changes } from "../Changes";
import type { PivotInfo } from "../PivotCanonicalizer";
import type { Rdp } from "../RdpCanonicalizer";
import type { SimpleWhereClause } from "../SimpleWhereClause";
import type { Store } from "../Store";
import { ListQuery, PIVOT_IDX, RDP_IDX, RIDS_IDX } from "./ListQuery";

type ExtractRelevantObjectsResult = Record<"added" | "modified", {
  all: (ObjectHolder | InterfaceHolder)[];
  strictMatches: Set<(ObjectHolder | InterfaceHolder)>;
  sortaMatches: Set<(ObjectHolder | InterfaceHolder)>;
}>;

export class InterfaceListQuery extends ListQuery {
  protected createPipeline(store: Store): PipelineSet<ObjectTypeDefinition> {
    const rdpConfig = this.cacheKey.otherKeys[RDP_IDX];
    const pivotInfo = this.cacheKey.otherKeys[PIVOT_IDX];
    const rids = this.cacheKey.otherKeys[RIDS_IDX];

    if (pivotInfo != null) {
      const sourceSet = createSourceSetForPivot(store, pivotInfo, rids);

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

    const type: string = "interface" as const;
    const objectTypeDef = {
      type,
      apiName: this.apiName,
    } as ObjectTypeDefinition;

    const clientCtx = store.client[additionalContext];
    let pipelineSet: PipelineSet<ObjectTypeDefinition>;
    if (rids != null) {
      pipelineSet = clientCtx.objectSetFactory(
        objectTypeDef,
        clientCtx,
        { type: "static", objects: [...rids] },
      );
    } else {
      pipelineSet = store.client(objectTypeDef);
    }

    if (rdpConfig != null) {
      pipelineSet = pipelineSet.withProperties(rdpConfig as Rdp);
    }

    return pipelineSet.where(this.canonicalWhere);
  }

  async revalidateObjectType(objectType: string): Promise<boolean> {
    if (await super.revalidateObjectType(objectType)) return true;

    // For interface queries: also check if the invalidated concrete type
    // implements this query's interface. e.g. invalidating "Employee"
    // should revalidate a query for "Assignable" if Employee implements it.
    try {
      const objectMetadata = await this.store.client.fetchMetadata({
        type: "object",
        apiName: objectType,
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
  ): ListPayload {
    const resolvedList = params.resolvedData?.map((obj: ObjectHolder) =>
      obj.$as(this.apiName)
    );

    return {
      ...super.createPayload(params),
      resolvedList,
    };
  }

  protected extractRelevantObjects(
    changes: Changes,
  ): ExtractRelevantObjectsResult {
    const matchesApiName = ([, object]: [unknown, ObjectHolder]) => {
      return this.apiName in object[ObjectDefRef].interfaceMap;
    };

    const added = Array.from(changes.addedObjects).filter(matchesApiName).map((
      [, object],
    ) => object.$as(this.apiName));

    const modified = Array.from(changes.modifiedObjects).filter(matchesApiName)
      .map((
        [, object],
      ) => object.$as(this.apiName));

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
      } as ObjectTypeDefinition,
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
  } as ObjectTypeDefinition) as PipelineSet<ObjectOrInterfaceDefinition>;
}

// Hopefully this can go away when we can just request the full object properties on first load
async function reloadDataAsFullObjects(
  client: Client,
  data: Coach.Instance<any>[],
) {
  if (data.length === 0) {
    return data;
  }

  const groups = groupBy(data, (x) => x.$objectType);
  const objectTypeToPrimaryKeyToObject = Object.fromEntries(
    await Promise.all(
      Object.entries(groups).map<
        Promise<
          [
            /** objectType **/ string,
            Record<string | number, Coach.Instance<ObjectTypeDefinition>>,
          ]
        >
      >(async ([apiName, objects]) => {
        // Interface query results don't have ObjectDefRef, so we fetch metadata to get primaryKeyApiName
        const objectDef = await client.fetchMetadata({
          type: "object",
          apiName,
        });
        const where: SimpleWhereClause = {
          [objectDef.primaryKeyApiName]: {
            $in: objects.map(x => x.$primaryKey),
          },
        };

        const result = await client(
          objectDef as ObjectTypeDefinition,
        ).where(
          where as Parameters<PipelineSet<ObjectTypeDefinition>["where"]>[0],
        ).fetchPage({ $includeRid: true });
        return [
          apiName,
          Object.fromEntries(result.data.map(
            x => [x.$primaryKey, x],
          )),
        ];
      }),
    ),
  );

  return data.map((obj) => {
    const fullObject =
      objectTypeToPrimaryKeyToObject[obj.$objectType][obj.$primaryKey];
    invariant(
      fullObject,
      `Could not find object ${obj.$objectType} ${obj.$primaryKey}`,
    );
    return fullObject;
  });
}
