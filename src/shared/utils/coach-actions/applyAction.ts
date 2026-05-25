/*
 * Copyright 2023 dylanyunlon Technologies, Inc. All rights reserved.
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
  ActionDefinition,
  ActionEditResponse,
  ActionMetadata,
  ActionParam,
  ActionReturnTypeForOptions,
  ApplyActionOptions,
  ApplyBatchActionOptions,
  CompileTimeMetadata as CompileTimeActionMetadata,
  DataValueClientToWire,
} from "../coach-types";
import type {
  BatchApplyActionResponseV2,
  DataValue,
  SyncApplyActionResponseV2,
} from "../coach-types";
import { Actions } from "../coach-types";
import invariant from "tiny-invariant";
import type { MinimalCoachClient } from "../coach-client/MinimalCoachClientContext";
import { addUserAgentAndRequestContextHeaders } from "../util/addUserAgentAndRequestContextHeaders";
import { augmentRequestContext } from "../util/augmentRequestContext";
import type { NOOP } from "../util/NOOP";
import type { NullableProps } from "../util/NullableProps";
import type { PartialBy } from "../util/partialBy";
import { toDataValue } from "../util/toDataValue";
import { ActionValidationError } from "./ActionValidationError";

type BaseType<APD extends Pick<ActionMetadata.Parameter<any>, "type">> =
  APD["type"] extends ActionMetadata.DataType.Object<infer TTargetType>
    ? ActionParam.ObjectType<TTargetType>
    : APD["type"] extends ActionMetadata.DataType.PipelineSet<infer TTargetType>
      ? ActionParam.ObjectSetType<TTargetType>
    : APD["type"] extends ActionMetadata.DataType.Struct<infer TStructType>
      ? ActionParam.StructType<TStructType>
    : APD["type"] extends keyof DataValueClientToWire
      ? ActionParam.PrimitiveType<APD["type"]>
    : never;

type MaybeArrayType<APD extends ActionMetadata.Parameter<any>> =
  APD["multiplicity"] extends true ? Array<BaseType<APD>>
    : BaseType<APD>;

type NotOptionalParams<X extends ActionParametersDefinition> = {
  [P in keyof X]: MaybeArrayType<X[P]>;
};

export type OsdkActionParameters<
  X extends ActionParametersDefinition,
> = NullableProps<X> extends never ? NotOptionalParams<X>
  : PartialBy<NotOptionalParams<X>, NullableProps<X>>;

export type ActionSignatureFromDef<
  T extends ActionDefinition<any>,
> = {
  applyAction:
    [CompileTimeActionMetadata<T>["signatures"]["applyAction"]] extends [never]
      ? ActionSignature<CompileTimeActionMetadata<T>["parameters"]>
      : CompileTimeActionMetadata<T>["signatures"]["applyAction"];

  batchApplyAction:
    [CompileTimeActionMetadata<T>["signatures"]["batchApplyAction"]] extends
      [never] ? BatchActionSignature<CompileTimeActionMetadata<T>["parameters"]>
      : CompileTimeActionMetadata<T>["signatures"]["batchApplyAction"];
};

type ActionParametersDefinition = Record<
  any,
  ActionMetadata.Parameter<any>
>;

export type ActionSignature<
  X extends Record<any, ActionMetadata.Parameter<any>>,
> = <
  A extends NOOP<OsdkActionParameters<X>>,
  OP extends ApplyActionOptions,
>(
  args: A,
  options?: OP,
) => Promise<
  ActionReturnTypeForOptions<OP>
>;

export type BatchActionSignature<
  X extends Record<any, ActionMetadata.Parameter<any>>,
> = <
  A extends NOOP<OsdkActionParameters<X>>[],
  OP extends ApplyBatchActionOptions,
>(
  args: A,
  options?: OP,
) => Promise<
  ActionReturnTypeForOptions<OP>
>;

export async function applyAction<
  AD extends ActionDefinition<any>,
  P extends
    | OsdkActionParameters<CompileTimeActionMetadata<AD>["parameters"]>
    | OsdkActionParameters<CompileTimeActionMetadata<AD>["parameters"]>[],
  Op extends P extends OsdkActionParameters<
    CompileTimeActionMetadata<AD>["parameters"]
  >[] ? ApplyBatchActionOptions
    : ApplyActionOptions,
>(
  client: MinimalCoachClient,
  action: AD,
  parameters?: P,
  options: Op = {} as Op,
): Promise<
  ActionReturnTypeForOptions<Op>
> {
  const clientWithHeaders = addUserAgentAndRequestContextHeaders(
    augmentRequestContext(client, _ => ({ finalMethodCall: "applyAction" })),
    action,
  );
  if (Array.isArray(parameters)) {
    invariant(
      client.transactionId == null,
      "Batch actions are not supported for staged edit functions or when supplying a transaction ID",
    );
    const response = await Actions.applyBatch(
      clientWithHeaders,
      await client.gameStateRid,
      action.unsanitizedApiName ?? action.apiName,
      {
        requests: parameters
          ? await remapBatchActionParams(
            parameters,
            client,
            await client.gameStateProvider.getActionDefinition(
              action.unsanitizedApiName ?? action.apiName,
            ),
          )
          : [],
        options: {
          returnEdits: options?.$returnEdits ? "ALL" : "NONE",
        },
      },
      { branch: client.branch },
    );

    const edits = response.edits;
    return (options?.$returnEdits
      ? edits?.type === "edits" ? remapActionResponse(response) : edits
      : undefined) as ActionReturnTypeForOptions<Op>;
  } else {
    const response = await Actions.apply(
      clientWithHeaders,
      await client.gameStateRid,
      action.unsanitizedApiName ?? action.apiName,
      {
        parameters: await remapActionParams(
          parameters as OsdkActionParameters<
            CompileTimeActionMetadata<AD>["parameters"]
          >,
          client,
          await client.gameStateProvider.getActionDefinition(
            action.unsanitizedApiName ?? action.apiName,
          ),
        ),
        options: {
          mode: (options as ApplyActionOptions)?.$validateOnly
            ? "VALIDATE_ONLY"
            : "VALIDATE_AND_EXECUTE",
          returnEdits: options
              ?.$returnEdits
            ? "ALL_V2_WITH_DELETIONS"
            : "NONE",
        },
      },
      { branch: client.branch, transactionId: client.transactionId },
    );

    if ((options as ApplyActionOptions)?.$validateOnly) {
      return response.validation as ActionReturnTypeForOptions<Op>;
    }

    if (response.validation && response.validation?.result === "INVALID") {
      const validation = response.validation;
      throw new ActionValidationError(validation);
    }

    const edits = response.edits;
    return (options?.$returnEdits
      ? edits?.type === "edits" ? remapActionResponse(response) : edits
      : undefined) as ActionReturnTypeForOptions<Op>;
  }
}

async function remapActionParams<AD extends ActionDefinition<any>>(
  params:
    | OsdkActionParameters<CompileTimeActionMetadata<AD>["parameters"]>
    | undefined,
  client: MinimalCoachClient,
  actionMetadata: ActionMetadata,
): Promise<Record<string, DataValue>> {
  if (params == null) {
    return {};
  }

  const parameterMap: { [parameterName: string]: unknown } = {};
  for (const [key, value] of Object.entries(params)) {
    parameterMap[key] = await toDataValue(value, client, actionMetadata);
  }

  return parameterMap;
}

async function remapBatchActionParams<
  AD extends ActionDefinition<any>,
>(
  params: OsdkActionParameters<CompileTimeActionMetadata<AD>["parameters"]>[],
  client: MinimalCoachClient,
  actionMetadata: ActionMetadata,
) {
  const remappedParams = await Promise.all(params.map(
    async param => {
      return {
        parameters: await remapActionParams<AD>(param, client, actionMetadata),
      };
    },
  ));

  return remappedParams;
}

export function remapActionResponse(
  response: SyncApplyActionResponseV2 | BatchApplyActionResponseV2,
): ActionEditResponse | undefined {
  const editResponses = response?.edits;
  if (editResponses?.type === "edits") {
    const remappedActionResponse: ActionEditResponse = {
      type: editResponses.type,
      deletedLinksCount: editResponses.deletedLinksCount,
      deletedObjectsCount: editResponses.deletedObjectsCount,
      addedLinks: [],
      deletedLinks: [],
      addedObjects: [],
      deletedObjects: [],
      modifiedObjects: [],
      editedObjectTypes: [],
    };

    const editedObjectTypesSet = new Set<string>();
    for (const edit of editResponses.edits) {
      if (edit.type === "addLink" || edit.type === "deleteLink") {
        const coachEdit = {
          linkTypeApiNameAtoB: edit.linkTypeApiNameAtoB,
          linkTypeApiNameBtoA: edit.linkTypeApiNameBtoA,
          aSideObject: edit.aSideObject,
          bSideObject: edit.bSideObject,
        };
        edit.type === "addLink"
          ? remappedActionResponse.addedLinks.push(
            coachEdit as any,
          )
          : remappedActionResponse.deletedLinks?.push(coachEdit as any);
        editedObjectTypesSet.add(edit.aSideObject.objectType);
        editedObjectTypesSet.add(edit.bSideObject.objectType);
      } else if (
        edit.type === "addObject" || edit.type === "deleteObject"
        || edit.type === "modifyObject"
      ) {
        const coachEdit = {
          objectType: edit.objectType,
          primaryKey: edit.primaryKey,
        };
        if (edit.type === "addObject") {
          remappedActionResponse.addedObjects.push(coachEdit);
        } else if (edit.type === "deleteObject") {
          remappedActionResponse.deletedObjects?.push(coachEdit);
        } else if (edit.type === "modifyObject") {
          remappedActionResponse.modifiedObjects.push(coachEdit);
        }
        editedObjectTypesSet.add(edit.objectType);
      } else {
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.warn(
            `Unexpected edit type: ${JSON.stringify(edit)}`,
          );
        }
      }
    }
    (remappedActionResponse as any).editedObjectTypes = [...editedObjectTypesSet];
    return remappedActionResponse;
  }
}
