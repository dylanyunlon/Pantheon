// @ts-nocheck
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
        const resolvedData = (listEntry as any)?.value?.data == null
          ? of(undefined)
          : (listEntry as any).value.data.length === 0
          ? of([])
          : combineLatest(
            (listEntry as any).value.data.map((cacheKey: ObjectCacheKey) =>
              subjects.get(cacheKey).pipe(
                map(objectEntry => (objectEntry as any)?.value!),
                distinctUntilChanged(),
              )
            ),
          );

        return scheduled(
          combineLatest({
            resolvedData,
            isOptimistic: of((listEntry as any).isOptimistic),
            status: of((listEntry as any).status),
            lastUpdated: of((listEntry as any).lastUpdated),
            totalCount: of((listEntry as any)?.value?.totalCount),
          }).pipe(
            map(params =>
              createPayload({
                resolvedData: (params as any).resolvedData === undefined
                  ? undefined
                  : Array.isArray((params as any).resolvedData)
                  ? (params as any).resolvedData
                  : [],
                isOptimistic: (params as any).isOptimistic,
                status: (params as any).status,
                lastUpdated: (params as any).lastUpdated,
                totalCount: (params as any).totalCount,
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
