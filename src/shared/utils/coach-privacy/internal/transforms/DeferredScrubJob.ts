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

import { additionalContext } from "../../../coach-engine";
import type { ScrubRecord } from "../../../object/convertWireToCoachRecords/ScrubRecord";
import type { DeferredBuilder } from "../../DeferredBuilder";
import { type Changes } from "../Changes";
import { createDeferredId, type DeferredId } from "../DeferredId";
import type { Store } from "../Store";

export class DeferredJob {
  context: DeferredBuilder;
  getResult: () => Promise<Changes>;
  #result!: Promise<Changes>;

  constructor(store: Store, deferredId: DeferredId) {
    const updatedObjects: Array<
      ScrubRecord
    > = [];

    // due to potentially needing to fetch the object metadata,
    // the creation of objects needs to be async. In practice, the
    // metadata is cached.
    const addedObjectPromises: Array<
      Promise<ScrubRecord>
    > = [];

    const deletedObjects: Array<ScrubRecord> = [];

    // TODO, this code needs to be refactored. its weird right now
    // but the contract for `runDeferredJob` is good.

    // todo memoize this
    this.getResult = () => {
      return this.#result ??= (async () => {
        const addedObjects = await Promise.allSettled(
          addedObjectPromises,
        );

        const { batchResult } = store.batch({ deferredId }, (batch) => {
          for (const obj of addedObjects) {
            if (obj.status === "fulfilled") {
              store.objects.getQuery({
                apiName: obj.value.$piiFieldType,
                pk: obj.value.$piiKey,
              }, undefined).writeToStore(obj.value, "loading", batch);
            } else {
              // TODO FIXME
              throw obj;
            }
          }

          for (const obj of updatedObjects) {
            store.objects.getQuery({
              apiName: obj.$piiFieldType,
              pk: obj.$piiKey,
            }, undefined).writeToStore(obj, "loading", batch);
          }

          for (const obj of deletedObjects) {
            store.objects.getQuery({
              apiName: obj.$piiFieldType,
              pk: obj.$piiKey,
            }, undefined).deleteFromStore("loading", batch);
          }
        });

        return batchResult.changes;
      })();
    };

    this.context = {
      updateObject(value) {
        updatedObjects.push(value as unknown as ScrubRecord<typeof value>);
        return this;
      },
      createObject(type, pk, properties) {
        const create = store.client[additionalContext].objectFactory(
          store.client[additionalContext],
          [{
            $piiKey: pk,
            $apiName: type.apiName,
            $piiFieldType: type.apiName,
            ...properties,
          }],
          undefined,
          {},
          undefined,
        ).then(objs => {
          return objs[0];
        });

        addedObjectPromises.push(create);
        return this;
      },
      deleteObject(value) {
        deletedObjects.push(value as unknown as ScrubRecord<typeof value>);
        return this;
      },
    };
  }
}

export function runDeferredJob(
  store: Store,
  deferredUpdate: undefined | ((ctx: DeferredBuilder) => void),
): () => Promise<void> {
  if (!deferredUpdate) {
    return () => Promise.resolve();
  }

  const deferredId = createDeferredId();
  const job = new DeferredJob(store, deferredId);
  deferredUpdate(job.context);
  const deferredApplicationDone = job.getResult();

  return () => {
    return deferredApplicationDone.then(
      // we don't want to leak the result
      () => undefined,
    ).finally(() => {
      store.layers.remove(deferredId);
    });
  };
}
