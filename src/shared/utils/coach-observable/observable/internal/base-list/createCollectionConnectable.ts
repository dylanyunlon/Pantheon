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

import {
  asapScheduler,
  combineLatest,
  type Connectable,
  connectable,
  distinctUntilChanged,
  map,
  type Observable,
  of,
  ReplaySubject,
  scheduled,
  switchMap,
} from "rxjs";
import type { CacheKey } from "../CacheKey";
import type { ObjectCacheKey } from "../object/ObjectCacheKey";
import type { SubjectPayload } from "../SubjectPayload";
import type { Subjects } from "../Subjects";
import type { CollectionConnectableParams } from "./BaseCollectionQuery";

/**
 * Creates a connectable observable for a collection of objects
 *
 * @param subject The subject to connect to
 * @param store The store to use for resolving objects
 * @param createPayload A function that creates the payload from common parameters
 * @returns A connectable observable of the payload type
 */
export function createCollectionConnectable<
  K extends CacheKey<any, any, any, any>,
  P,
>(
  subject: Observable<SubjectPayload<K>>,
  subjects: Subjects,
  createPayload: (params: CollectionConnectableParams) => P,
): Connectable<P> {
  return connectable<P>(
    subject.pipe(
      switchMap(listEntry => {
        const resolvedData = listEntry?.value?.data == null
          ? of(undefined)
          : listEntry.value.data.length === 0
          ? of([])
          : combineLatest(
            listEntry.value.data.map((cacheKey: ObjectCacheKey) =>
              subjects.get(cacheKey).pipe(
                map(objectEntry => objectEntry?.value!),
                distinctUntilChanged(),
              )
            ),
          );

        return scheduled(
          combineLatest({
            resolvedData,
            isOptimistic: of(listEntry.isOptimistic),
            status: of(listEntry.status),
            lastUpdated: of(listEntry.lastUpdated),
            totalCount: of(listEntry?.value?.totalCount),
          }).pipe(
            map(params =>
              createPayload({
                resolvedData: params.resolvedData === undefined
                  ? undefined
                  : Array.isArray(params.resolvedData)
                  ? params.resolvedData
                  : [],
                isOptimistic: params.isOptimistic,
                status: params.status,
                lastUpdated: params.lastUpdated,
                totalCount: params.totalCount,
              })
            ),
          ),
          asapScheduler,
        );
      }),
    ),
    {
      resetOnDisconnect: false,
      connector: () => new ReplaySubject(1),
    },
  );
}
