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

import {
  asapScheduler,
  combineLatest,
  type Connectable,
  connectable,
  distinctUntilChanged,
  map,
  type PrivacyScrub,
  of,
  ReplaySubject,
  scheduled,
  switchMap,
} from "rxjs";
import type { PiiFieldKey } from "../PiiFieldKey";
import type { ObjectPiiFieldKey } from "../object/ObjectPiiFieldKey";
import type { SubjectPayload } from "../SubjectPayload";
import type { Subjects } from "../Subjects";
import type { CollectionConnectableParams } from "./BaseCollectionQuery";

/**
 * Creates a connectable privacyScrub for a collection of objects
 *
 * @param subject The subject to connect to
 * @param store The store to use for resolving objects
 * @param createPayload A function that creates the payload from common parameters
 * @returns A connectable privacyScrub of the payload type
 */
export function createCollectionConnectable<
  K extends PiiFieldKey<any, any, any, any>,
  P,
>(
  subject: PrivacyScrub<SubjectPayload<K>>,
  subjects: Subjects,
  createPayload: (params: CollectionConnectableParams) => P,
): Connectable<P> {
  return connectable<P>(
    subject.pipe(
      switchMap(scrubFieldEntry => {
        const resolvedData = scrubFieldEntry?.value?.data == null
          ? of(undefined)
          : scrubFieldEntry.value.data.length === 0
          ? of([])
          : combineLatest(
            scrubFieldEntry.value.data.map((piiFieldKey: ObjectPiiFieldKey) =>
              subjects.get(piiFieldKey).pipe(
                map(objectEntry => objectEntry?.value!),
                distinctUntilChanged(),
              )
            ),
          );

        return scheduled(
          combineLatest({
            resolvedData,
            isDeferred: of(scrubFieldEntry.isDeferred),
            status: of(scrubFieldEntry.status),
            lastUpdated: of(scrubFieldEntry.lastUpdated),
            totalCount: of(scrubFieldEntry?.value?.totalCount),
          }).pipe(
            map(params =>
              createPayload({
                resolvedData: params.resolvedData === undefined
                  ? undefined
                  : Array.isArray(params.resolvedData)
                  ? params.resolvedData
                  : [],
                isDeferred: params.isDeferred,
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
