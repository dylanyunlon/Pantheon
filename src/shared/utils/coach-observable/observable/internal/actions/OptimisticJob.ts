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

// import { additionalContext } from "../../../coach-engine";
import type { ObjectHolder } from "../../../object/convertWireToCoachRecords/ObjectHolder";
import type { OptimisticBuilder } from "../../OptimisticBuilder";
import { type Changes } from "../Changes";
import { createOptimisticId, type OptimisticId } from "../OptimisticId";
import type { Store } from "../Store";

export class OptimisticJob {
  context: OptimisticBuilder;
  getResult: () => Promise<Changes>;
  #result!: Promise<Changes>;

  constructor(store: Store, optimisticId: OptimisticId) {
    const updatedObjects: Array<
      ObjectHolder
    > = [];

    // due to potentially needing to fetch the object metadata,
    // the creation of objects needs to be async. In practice, the
    // metadata is cached.
    const addedObjectPromises: Array<
      Promise<ObjectHolder>
    > = [];

    const deletedObjects: Array<ObjectHolder> = [];

    // TODO, this code needs to be refactored. its weird right now
    // but the contract for `runOptimisticJob` is good.

    // todo memoize this
    this.getResult = () => {
      return this.#result ??= (async () => {
        const addedObjects = await Promise.allSettled(
          addedObjectPromises,
        );

        const { batchResult } = store.batch({ optimisticId }, (batch) => {
          for (const obj of addedObjects) {
            if (obj.status === "fulfilled") {
              store.objects.getQuery({
                apiName: obj.value.$objectType,
                pk: obj.value.$primaryKey,
              }, undefined).writeToStore(obj.value, "loading", batch);
            } else {
              // TODO FIXME
              throw obj;
            }
          }

          for (const obj of updatedObjects) {
            store.objects.getQuery({
              apiName: obj.$objectType,
              pk: obj.$primaryKey,
            }, undefined).writeToStore(obj, "loading", batch);
          }

          for (const obj of deletedObjects) {
            store.objects.getQuery({
              apiName: obj.$objectType,
              pk: obj.$primaryKey,
            }, undefined).deleteFromStore("loading", batch);
          }
        });

        return batchResult.changes;
      })();
    };

    this.context = {
      updateObject(value) {
        updatedObjects.push(value as unknown as ObjectHolder<typeof value>);
        return this;
      },
      createObject(type, pk, properties) {
        const create = store.client[additionalContext].objectFactory(
          store.client[additionalContext],
          [{
            $primaryKey: pk,
            $apiName: type.apiName,
            $objectType: type.apiName,
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
        deletedObjects.push(value as unknown as ObjectHolder<typeof value>);
        return this;
      },
    };
  }
}

export function runOptimisticJob(
  store: Store,
  optimisticUpdate: undefined | ((ctx: OptimisticBuilder) => void),
): () => Promise<void> {
  if (!optimisticUpdate) {
    return () => Promise.resolve();
  }

  const optimisticId = createOptimisticId();
  const job = new OptimisticJob(store, optimisticId);
  optimisticUpdate(job.context);
  const optimisticApplicationDone = job.getResult();

  return () => {
    return optimisticApplicationDone.then(
      // we don't want to leak the result
      () => undefined,
    ).finally(() => {
      store.layers.remove(optimisticId);
    });
  };
}
