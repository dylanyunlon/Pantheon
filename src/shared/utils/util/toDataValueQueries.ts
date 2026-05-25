// @ts-nocheck
/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
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

import type { QueryDataTypeDefinition } from "../types";
import { MediaSets } from "../types";
import { type DataValue } from "../types";
import { Attachments } from "../types";
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
import {
  isInterfaceQueryParam,
  isInterfaceSpecifier,
} from "./interfaceUtils";
import { isObjectSpecifiersObject } from "./isObjectSpecifiersObject";
import { extractPrimaryKeyFromObjectSpecifier } from "./objectSpecifierUtils";
import { isWireObjectSet } from "./PipelineObjectSet";

/**
 * Marshall user-facing data into the wire DataValue type
 *
 * @see DataValue for the expected payloads
 * @internal
 */
export async function toDataValueQueries(
  value: unknown,
  client: MinimalClient,
  desiredType: QueryDataTypeDefinition,
): Promise<DataValue> {
  if (value == null) {
    return value;
  }

  if (Array.isArray(value) && desiredType.type === "array") {
    const values = Array.from(value);
    if (
      values.some((dataValue) =>
        isAttachmentUpload(dataValue) || isAttachmentFile(dataValue)
      )
    ) {
      const converted = [];
      for (const value of values) {
        converted.push(await toDataValueQueries(value, client, desiredType));
      }
      return converted;
    }
    const promiseArray = Array.from(
      value,
      async (innerValue) =>
        await toDataValueQueries(innerValue, client, desiredType.array),
    );
    return Promise.all(promiseArray);
  }

  switch (desiredType.type) {
    case "attachment": {
      if (isAttachmentUpload(value)) {
        const attachment = await Attachments.upload(
          client,
          value.data,
          {
            filename: (value as any).name,
          },
        );
        return attachment.rid;
      }

      if (
        isAttachmentFile(value)
      ) {
        const attachment = await Attachments.upload(
          client,
          value,
          {
            filename: (value as any).name as string,
          },
        );
        return attachment.rid;
      }

      // If it's not an upload, it's just an attachment rid string which we can pass through
      return value;
    }
    case "twoDimensionalAggregation": {
      return {
        groups: value,
      };
    }
    case "threeDimensionalAggregation": {
      return {
        groups: value,
      };
    }

    case "mediaReference": {
      if (isMediaUpload(value)) {
        const mediaRef = await MediaSets.uploadMedia(
          client,
          (value as any).data,
          {
            filename: (value as any).fileName,
            preview: true,
          },
        );
        return mediaRef;
      }

      if (isMedia(value)) {
        return (value as any).getMediaReference();
      }

      if (isMediaReference(value)) {
        return value;
      }

      throw new Error(
        "Expected media reference type but got value that is not a MediaReference or MediaUpload",
      );
    }

    case "set": {
      if (value instanceof Set) {
        const promiseArray = Array.from(
          value,
          async (innerValue) =>
            await toDataValueQueries(innerValue, client, desiredType["set"]),
        );
        return Promise.all(promiseArray);
      }
      break;
    }
    case "object": {
      if (isObjectSpecifiersObject(value)) {
        return value.$primaryKey;
      }
      break;
    }
    case "interface": {
      if (isInterfaceSpecifier(value) || isInterfaceQueryParam(value)) {
        return {
          objectTypeApiName: value.$objectType,
          primaryKeyValue: value.$primaryKey,
        };
      }
    }
    case "objectSet":
    case "interfaceObjectSet": {
      // object set (the rid as a string (passes through the last return), or the ObjectSet definition directly)
      if (isWireObjectSet(value)) {
        return value;
      }
      if (isObjectSet(value)) {
        return getWireObjectSet(value);
      }
      break;
    }

    case "map": {
      if (typeof value === "object") {
        const entrySet: Array<{ key: any; value: any }> = [];
        for (const [key, mapValue] of Object.entries(value)) {
          entrySet.push({
            key: desiredType.keyType.type === "object"
              ? extractPrimaryKeyFromObjectSpecifier(key as any)
              : await toDataValueQueries(
                key,
                client,
                desiredType.keyType,
              ),
            value: await toDataValueQueries(
              mapValue,
              client,
              desiredType.valueType,
            ),
          });
        }
        return entrySet;
      }
      break;
    }

    case "struct": {
      if (typeof value === "object") {
        const structMap: { [key: string]: unknown } = {};
        for (const [key, structValue] of Object.entries(value)) {
          structMap[key] = await toDataValueQueries(
            structValue,
            client,
            desiredType["struct"][key],
          );
        }
        return structMap;
      }
    }

    case "boolean":
    case "date":
    case "double":
    case "float":
    case "integer":
    case "long":
    case "string":
    case "timestamp":
      return value;
  }
  return value;
}
