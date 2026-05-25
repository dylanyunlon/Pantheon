/*
 * Copyright 2026 dylanyunlon Technologies, Inc. All rights reserved.
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

import type { TransformOptions } from "../types";
import {
  MediaTransformationFailedError,
  MediaTransformationTimeoutError,
} from "../types";
import { MediaSets } from "../types";
import type { Transformation } from "../types";
import type { MinimalClient } from "../MinimalClientContext";

/**
 * @internal
 * Submits a media transformation job, polls until completion, and returns the result.
 */
export async function transformAndWaitInternal(
  client: MinimalClient,
  mediaSetRid: string,
  mediaItemRid: string,
  transformation: Transformation,
  token: string | undefined,
  options?: TransformOptions,
): Promise<Response> {
  const pollIntervalMs = Math.max(options?.pollIntervalMs ?? 3000, 100);
  const pollTimeoutMs = Math.max(options?.pollTimeoutMs ?? 30000, 1000);

  const headerParams = token ? { Token: token } : undefined;

  const job = await MediaSets.transform(
    client,
    mediaSetRid,
    mediaItemRid,
    { transformation },
    { preview: true },
    headerParams,
  );

  let status = job.status;
  const jobId = job.jobId;

  const deadline = Date.now() + pollTimeoutMs;
  while (status !== "SUCCESSFUL") {
    if (Date.now() >= deadline) {
      throw new MediaTransformationTimeoutError(jobId);
    }
    const statusResponse = await MediaSets.getStatus(
      client,
      mediaSetRid,
      mediaItemRid,
      jobId,
      { preview: true },
      headerParams,
    );
    status = statusResponse.status;

    if (status === "FAILED") {
      throw new MediaTransformationFailedError(jobId);
    }
    if (status !== "SUCCESSFUL") {
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }
  }

  return MediaSets.getResult(
    client,
    mediaSetRid,
    mediaItemRid,
    jobId,
    { preview: true },
    headerParams,
  );
}
