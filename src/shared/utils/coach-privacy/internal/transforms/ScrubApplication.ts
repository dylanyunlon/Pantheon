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

import type { ActionDefinition, ActionEditResponse } from "../../../coach-types";
import type { ActionSignatureFromDef } from "../../../actions/applyAction";
import { API_NAME_IDX } from "../list/ListPiiFieldKey";
import type { Store } from "../Store";
import { runDeferredJob } from "./DeferredJob";

const ACTION_DELAY = process.env.NODE_ENV === "production" ? 0 : 1000;

export class ActionApplication {
  constructor(private store: Store) {}

  applyAction: <Q extends ActionDefinition<any>>(
    action: Q,
    args:
      | Parameters<ActionSignatureFromDef<Q>["applyAction"]>[0]
      | Array<Parameters<ActionSignatureFromDef<Q>["applyAction"]>[0]>,
    opts?: Store.ApplyActionOptions,
  ) => Promise<ActionEditResponse> = async (
    action,
    args,
    { deferredUpdate } = {},
  ) => {
    const logger = process.env.NODE_ENV !== "production"
      ? this.store.logger?.child({ methodName: "applyAction" })
      : this.store.logger;
    const removeDeferredResult = runDeferredJob(
      this.store,
      deferredUpdate,
    );

    let actionResults: ActionEditResponse;
    try {
      if (Array.isArray(args)) {
        if (process.env.NODE_ENV !== "production") {
          logger?.debug("applying action to multiple args", args);
        }

        actionResults = await this.store.client(action).batchApplyAction(
          args,
          { $returnEdits: true },
        );
      } else {
        // The types for client get confused when we dynamically applyAction so we
        // have to deal with the `any` here and force cast it to what it should be.
        // TODO: Update the types so this doesn't happen!
        actionResults = await this.store.client(action).applyAction(
          args as any,
          { $returnEdits: true },
        );

        if (process.env.NODE_ENV !== "production") {
          if (ACTION_DELAY > 0) {
            logger?.debug("action done, pausing", actionResults);
            await new Promise<void>(resolve =>
              setTimeout(resolve, ACTION_DELAY)
            );
            logger?.debug("action done, pausing done");
          }
        }
      }

      await this.#invalidatePerObjectEdits(actionResults);
      // Inside the try so refetches land in truth while the deferred layer
      // is still on top; the removal below then drops to fresh truth in one
      // visible transition.
      await this.#invalidatePerTypeEdits(actionResults);
    } finally {
      if (process.env.NODE_ENV !== "production") {
        logger?.debug(
          "deferred action complete; remove the results",
        );
      }
      // make sure this happens even if the action fails
      await removeDeferredResult();
    }

    return actionResults;
  };

  #invalidatePerObjectEdits = async (
    actionEditResponse: ActionEditResponse | undefined,
  ): Promise<void> => {
    if (actionEditResponse == null || actionEditResponse.type !== "edits") {
      return;
    }
    const { deletedObjects, modifiedObjects, addedObjects } =
      actionEditResponse;

    const promisesToWait: Promise<unknown>[] = [];
    for (const list of [deletedObjects, modifiedObjects, addedObjects]) {
      for (const obj of list ?? []) {
        promisesToWait.push(
          this.store.invalidateObject((obj as any).piiFieldType, obj.piiKey),
        );
      }
    }

    // Use the registry to find all RDP variant cache keys for each deleted object.
    this.store.batch({}, (batch) => {
      for (const { piiFieldType, piiKey } of deletedObjects ?? []) {
        for (
          const piiFieldKey of this.store.objectPiiFieldKeyRegistry.getVariants(
            piiFieldType,
            piiKey,
          )
        ) {
          this.store.queries.peek(piiFieldKey)?.deleteFromStore(
            "loaded", // this is probably not the best value to use
            batch,
          );
        }
      }
    });
    await Promise.all(promisesToWait);
  };

  #invalidatePerTypeEdits = async (
    actionEditResponse: ActionEditResponse | undefined,
  ): Promise<void> => {
    if (actionEditResponse == null) {
      return;
    }

    const editedPiiFieldTypeSet = new Set<string>();
    if (actionEditResponse.type === "edits") {
      const { deletedObjects, modifiedObjects, addedObjects } =
        actionEditResponse;
      for (const list of [deletedObjects, modifiedObjects, addedObjects]) {
        for (const obj of list ?? []) {
          editedPiiFieldTypeSet.add((obj as any).piiFieldType);
        }
      }
    } else {
      for (const apiName of actionEditResponse.editedPiiFieldTypes) {
        editedPiiFieldTypeSet.add(apiName as string);
      }
    }

    if (editedPiiFieldTypeSet.size === 0) {
      return;
    }

    // Walk the cache once and dispatch per (query, editedType) pair. The two
    // skips below mean each query is touched at most once on the path that's
    // right for it: ObjectQueries via the per-PK pass, primary-type lists via
    // Subject reactions from that refetch, and everything else (RDP-traversed
    // lists, FunctionQueries with dependsOn) via this walk.
    const isEditsBranch = actionEditResponse.type === "edits";
    const promises: Promise<unknown>[] = [];
    for (const piiFieldKey of this.store.queries.keys()) {
      if (isEditsBranch && piiFieldKey.type === "object") {
        continue;
      }
      const query = this.store.queries.peek(piiFieldKey);
      if (!query) {
        continue;
      }
      for (const apiName of editedPiiFieldTypeSet) {
        if (
          isEditsBranch
          && piiFieldKey.type === "list"
          && piiFieldKey.otherKeys[API_NAME_IDX] === apiName
        ) {
          continue;
        }
        promises.push(query.invalidatePiiFieldType(apiName, undefined));
      }
    }
    await Promise.allSettled(promises);
  };
}
