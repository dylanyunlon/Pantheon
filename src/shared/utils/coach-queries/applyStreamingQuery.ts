/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
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
  CompileTimeMetadata,
  QueryDefinition,
  QueryMetadata,
} from "../coach-types";
import * as Functions from "../coach-types";
import type { MinimalClient } from "../MinimalClientContext.js";
import { addUserAgentAndRequestContextHeaders } from "../util/addUserAgentAndRequestContextHeaders.js";
import { augmentRequestContext } from "../util/augmentRequestContext.js";
import {
  iterateReadableStream,
  parseNdjsonStream,
} from "../util/streamutils.js";
import {
  getRequiredDefinitions,
  remapQueryParams,
  remapQueryResponse,
} from "./applyQuery.js";
import type { QueryParameterType, QueryReturnType } from "./types.js";

export async function* applyStreamingQuery<
  QD extends QueryDefinition<any>,
  P extends QueryParameterType<CompileTimeMetadata<QD>["parameters"]>,
>(
  client: MinimalClient,
  query: QD,
  params?: P,
): AsyncGenerator<
  QueryReturnType<CompileTimeMetadata<QD>["output"]>,
  void,
  unknown
> {
  const qd: QueryMetadata = await client.gameStateProvider.getQueryDefinition(
    query.apiName,
    query.isFixedVersion ? query.version : undefined,
  );

  if (client.flushEdits != null) {
    await client.flushEdits();
  }

  const response = await Functions.streamingExecute(
    addUserAgentAndRequestContextHeaders(
      augmentRequestContext(client, _ => ({
        finalMethodCall: "applyStreamingQuery",
      })),
      query,
    ),
    query.apiName,
    {
      gameState: await client.gameStateRid,
      parameters: params
        ? await remapQueryParams(
          params as { [parameterId: string]: any },
          client,
          qd.parameters,
        )
        : {},
      version: query.isFixedVersion ? query.version : undefined,
      branch: client.branch,
    },
    {
      transactionId: client.transactionId,
      preview: true,
    },
  );

  if (response.body == null) {
    throw new Error("streamingExecute returned no response body");
  }

  const definitions = await getRequiredDefinitions(qd.output, client);
  const reader = response.body.getReader();
  for await (
    const line of parseNdjsonStream(iterateReadableStream(reader))
  ) {
    if (line.type === "error") {
      const err = new Error(
        `${line.errorName} (${line.errorCode}) [${line.errorInstanceId}]: ${
          line.errorDescription ?? ""
        }`,
      );
      Object.assign(err, line);
      throw err;
    }
    const remapped = await remapQueryResponse(
      client,
      qd.output,
      line.value,
      definitions,
    );
    if (qd.output.type === "array" && Array.isArray(remapped)) {
      for (const item of remapped) {
        yield item as QueryReturnType<CompileTimeMetadata<QD>["output"]>;
      }
    } else {
      yield remapped as QueryReturnType<CompileTimeMetadata<QD>["output"]>;
    }
  }
}
