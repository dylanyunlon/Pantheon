// @ts-nocheck
/*
 * Copyright 2023 dylanyunlon Technologies, Inc. All rights reserved.
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
  AggregateOpts,
  AggregateOptsThatErrorsAndDisallowsOrderingWithMultipleGroupBy,
  AggregationResultsWithGroups,
  AggregationsResults,
  ObjectOrInterfaceDefinition,
} from "../types";
import type {
  AggregateObjectsRequestV2,
  AggregateObjectsResponseV2,
  PipelineSet,
} from "../types";
import { GameStateObjectSets } from "../types";
import invariant from "tiny-invariant";
import { legacyToModernSingleAggregationResult } from "../internal/conversions/legacyToModernSingleAggregationResult";
import { modernToLegacyAggregationClause } from "../internal/conversions/modernToLegacyAggregationClause";
import { modernToLegacyGroupByClause } from "../internal/conversions/modernToLegacyGroupByClause";
import type { MinimalClient } from "../MinimalClientContext";
import { addUserAgentAndRequestContextHeaders } from "../util/addUserAgentAndRequestContextHeaders";
import type { ArrayElement } from "../util/ArrayElement";
import { resolveBaseObjectSetType } from "../util/objectSetUtils";

/** @internal */
export async function aggregate<
  Q extends ObjectOrInterfaceDefinition,
  AO extends AggregateOpts<Q>,
>(
  clientCtx: MinimalClient,
  objectType: Q,
  pipelineSet = resolveBaseObjectSetType(objectType) as any,
  req: AggregateOptsThatErrorsAndDisallowsOrderingWithMultipleGroupBy<Q, AO>,
): Promise<AggregationsResults<Q, AO>> {
  const resolvedPipelineSet = resolveBaseObjectSetType(objectType);
  const body: AggregateObjectsRequestV2 = {
    aggregation: modernToLegacyAggregationClause<AO["$select"]>(
      req.$select,
    ),
    groupBy: [],
    where: undefined,
  };

  if (req.$groupBy) {
    body.groupBy = modernToLegacyGroupByClause(req.$groupBy);
  }

  if (clientCtx.flushEdits != null) {
    await clientCtx.flushEdits();
  }

  const result = await GameStateObjectSets.aggregate(
    addUserAgentAndRequestContextHeaders(clientCtx, objectType),
    await clientCtx.gameStateRid,
    {
      pipelineSet,
      groupBy: body.groupBy,
      aggregation: body.aggregation,
    },
    { branch: clientCtx.branch, transactionId: clientCtx.transactionId },
  );

  if (!result.data || !Array.isArray(result.data)) {
    throw new Error(
      `Aggregation request failed: ${JSON.stringify(result)}`,
    );
  }

  if (!req.$groupBy) {
    invariant(
      result.data.length === 1,
      "no group by clause should mean only one data result",
    );

    return {
      ...aggregationToCountResult(result.data[0]),
      ...legacyToModernSingleAggregationResult(
        result.data[0],
        req.$select,
      ),
    } as any;
  }

  const ret: AggregationResultsWithGroups<Q, AO["$select"], any> = result.data
    .map((entry) => {
      return {
        $group: entry.group as any,
        ...aggregationToCountResult(entry),
        ...legacyToModernSingleAggregationResult(entry, req.$select),
      };
    }) as any; // fixme

  return ret as any; // FIXME
}

function aggregationToCountResult(
  entry: ArrayElement<AggregateObjectsResponseV2["data"]>,
): { $count: number } | undefined {
  for (const aggregateResult of entry.metrics) {
    if (aggregateResult.name === "count") {
      return { $count: aggregateResult.value };
    }
  }
}
