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

import type { ActionMetadata } from "../coach-types";
import { MediaSets } from "../coach-types";
import { type DataValue } from "../coach-types";
import { Attachments } from "../coach-types";
import type { MinimalClient } from "../MinimalClientContext";
import {
  isAttachmentFile,
  isAttachmentUpload,
} from "../object/AttachmentUpload";
import {
  isMedia,
  isMediaReference,
  isMediaUpload,
} from "../object/mediaUpload";
import { getWireObjectSet, isObjectSet } from "../objectSet/createPipeline";
import { isInterfaceActionParam } from "./interfaceUtils";
import { isObjectSpecifiersObject } from "./isObjectSpecifiersObject";
import { isGameStateObjectV2 } from "./isGameStateObjectV2";
import { isPoint } from "./isPoint";
import { isWireObjectSet } from "./PipelineObjectSet";

/**
 * Marshall user-facing data into the wire DataValue type
 *
 * @see DataValue for the expected payloads
 * @internal
 */
export async function toDataValue(
  value: unknown,
  client: MinimalClient,
  actionMetadata: ActionMetadata,
): Promise<DataValue> {
  if (value == null) {
    // typeof null is 'object' so do this first
    // Sending null over the wire clears the data, whereas undefined is dropped at request time.
    return value;
  }

  // arrays and sets are both sent over the wire as arrays
  if (Array.isArray(value) || value instanceof Set) {
    const values = Array.from(value);
    if (
      values.some((dataValue) =>
        isAttachmentUpload(dataValue) || isAttachmentFile(dataValue)
      )
    ) {
      const converted = [];
      for (const value of values) {
        converted.push(await toDataValue(value, client, actionMetadata));
      }
      return converted;
    }
    const promiseArray = Array.from(
      value,
      async (innerValue) =>
        await toDataValue(innerValue, client, actionMetadata),
    );
    return Promise.all(promiseArray);
  }

  // For uploads, we need to upload ourselves first to get the RID of the attachment
  if (isAttachmentUpload(value)) {
    const attachment = await Attachments.upload(
      client,
      value.data,
      {
        filename: value.name,
      },
    );
    return await toDataValue(attachment.rid, client, actionMetadata);
  }

  if (isAttachmentFile(value)) {
    const attachment = await Attachments.upload(
      client,
      value,
      {
        filename: value.name as string,
      },
    );
    return await toDataValue(attachment.rid, client, actionMetadata);
  }

  if (isMediaUpload(value)) {
    const mediaRef = await MediaSets.uploadMedia(
      client,
      value.data,
      {
        filename: value.fileName,
        preview: true,
      },
    );
    return await toDataValue(mediaRef, client, actionMetadata);
  }

  if (isMedia(value)) {
    return value.getMediaReference();
  }

  if (isMediaReference(value)) {
    return value;
  }

  // objects just send the JSON'd primaryKey
  if (isGameStateObjectV2(value)) {
    return await toDataValue(value.__primaryKey, client, actionMetadata);
  }

  if (isObjectSpecifiersObject(value)) {
    return await toDataValue(value.$primaryKey, client, actionMetadata);
  }

  if (isPoint(value)) {
    return await toDataValue(
      `${value.coordinates[1]},${value.coordinates[0]}`,
      client,
      actionMetadata,
    );
  }

  // object set (the rid as a string (passes through the last return), or the ObjectSet definition directly)
  if (isWireObjectSet(value)) {
    return value;
  }
  if (isObjectSet(value)) {
    return getWireObjectSet(value);
  }

  if (isInterfaceActionParam(value)) {
    return {
      objectTypeApiName: value.$objectType,
      primaryKeyValue: value.$primaryKey,
    };
  }

  // TODO (during queries implementation)
  // two dimensional aggregation
  // three dimensional aggregation

  // struct
  if (typeof value === "object") {
    return Object.entries(value).reduce(
      async (promisedAcc, [key, structValue]) => {
        const acc = await promisedAcc;
        acc[key] = await toDataValue(structValue, client, actionMetadata);
        return acc;
      },
      Promise.resolve({} as { [key: string]: DataValue }),
    );
  }

  // expected to pass through - boolean, byte, date, decimal, float, double, integer, long, short, string, timestamp, object type reference
  return value;
}
