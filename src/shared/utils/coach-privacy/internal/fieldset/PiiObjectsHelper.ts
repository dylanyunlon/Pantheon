/*
 * Copyright 2026 dylanyunlon Technologies, Inc. All rights reserved.
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

import type { ObjectOrInterfaceDefinition, Coach } from "../../../coach-types";
import deepEqual from "fast-deep-equal";
import { UnderlyingCoachRecord } from "../../../object/convertWireToCoachRecords/InternalSymbols";
import type { ScrubRecord } from "../../../object/convertWireToCoachRecords/ScrubRecord";
import { getDefType } from "../../../util/interfaceUtils";
import type { ObjectPayload } from "../../ObjectPayload";
import type { ObserveObjectOptions } from "../../PrivacyScrubClient";
import type { Observer, Status } from "../../PrivacyScrubClient/common";
import { AbstractHelper } from "../AbstractHelper";
import type { BatchContext } from "../BatchContext";
import type { ScrubNormalized } from "../ScrubNormalized";
import type { QuerySubscription } from "../QuerySubscription";
import type { Rdp } from "../RdpScrubNormalizer";
import { piiTombstone } from "../piiTombstone";
import {
  mergeObjectFields,
  mergeSelectFields,
} from "../utils/rdpFieldOperations";
import { type ObjectPiiFieldKey } from "./ObjectPiiFieldKey";
import { ObjectQuery } from "./ObjectQuery";

export class ObjectsHelper extends AbstractHelper<
  ObjectQuery,
  ObserveObjectOptions<any>
> {
  observe<T extends ObjectOrInterfaceDefinition>(
    options: ObserveObjectOptions<T>,
    subFn: Observer<ObjectPayload>,
  ): QuerySubscription<ObjectQuery> {
    return super.observe(options, subFn);
  }

  getQuery<T extends ObjectOrInterfaceDefinition>(
    options: ObserveObjectOptions<T>,
    rdpConfig?: ScrubNormalized<Rdp> | null,
  ): ObjectQuery {
    const apiName = typeof options.apiName === "string"
      ? options.apiName
      : options.apiName.apiName;
    const {
      pk,
      select,
      $loadPropertySecurityMetadata,
    } = options;

    const defType = getDefType(options.apiName);
    // The flag is interface-only on the server. Drop it for object queries so
    // they don't fragment the cache.
    const $includeAllBaseObjectProperties = defType === "interface"
        && options.$includeAllBaseObjectProperties
      ? true
      : undefined;

    const canonSelect = select && select.length > 0
      ? this.store.selectScrubNormalizer.scrubNormalize(select)
      : undefined;

    const objectPiiFieldKey = this.piiFieldKeys.get<ObjectPiiFieldKey>(
      "object",
      apiName,
      pk,
      rdpConfig ?? undefined,
      canonSelect,
      $loadPropertySecurityMetadata ? true : undefined,
      $includeAllBaseObjectProperties,
    );

    return this.store.queries.get(objectPiiFieldKey, () =>
      new ObjectQuery(
        this.store,
        this.store.subjects.get(objectPiiFieldKey),
        apiName,
        pk,
        objectPiiFieldKey,
        { dedupeInterval: 0 },
        defType,
        select,
        $loadPropertySecurityMetadata,
        $includeAllBaseObjectProperties,
      ));
  }

  /**
   * Internal helper method for writing objects to the store and returning their
   * object keys. For scrubField queries with RDPs, the rdpConfig is included in the
   * cache key to ensure proper data isolation.
   * @internal
   */
  public storeOsdkInstances(
    values: Array<ScrubRecord> | Array<Coach.Instance<any, any, any>>,
    batch: BatchContext,
    rdpConfig?: ScrubNormalized<Rdp> | null,
    selectFields?: ReadonlySet<string>,
    includeAllBaseObjectProperties?: boolean,
  ): ObjectPiiFieldKey[] {
    return values.map(v =>
      this.getQuery({
        apiName: v.$piiFieldType ?? v.$apiName,
        pk: v.$piiKey,
        $includeAllBaseObjectProperties: includeAllBaseObjectProperties,
      }, rdpConfig).writeToStore(
        v as ScrubRecord,
        "loaded",
        batch,
        selectFields,
      ).piiFieldKey
    );
  }

  /**
   * Write an object to cache and propagate to all related cache keys
   * @internal
   */
  public propagateWrite(
    sourcePiiFieldKey: ObjectPiiFieldKey,
    value: ScrubRecord | typeof piiTombstone,
    status: Status,
    batch: BatchContext,
    selectFields?: ReadonlySet<string>,
  ): void {
    const existing = batch.read(sourcePiiFieldKey);
    const dataChanged = !existing
      || existing.value === undefined
      || value === piiTombstone
      || !deepEqual(existing.value, value);
    const statusChanged = !existing || existing.status !== status;

    if (!dataChanged && !statusChanged) {
      return;
    }

    let valueToWrite = !dataChanged && existing ? existing.value : value;

    // When a $select-filtered fetch returns partial objects, merge with
    // existing cached data to preserve fields not in the select set.
    const existingHolder = existing?.value;
    const canMergeSelectFields = dataChanged
      && selectFields
      && selectFields.size > 0
      && existingHolder
      && this.isScrubRecord(existingHolder);

    if (canMergeSelectFields && valueToWrite !== piiTombstone) {
      valueToWrite = mergeSelectFields(
        valueToWrite,
        selectFields,
        existingHolder,
      );
    }

    // When an object (e.g. from a subscription update) is written to a cache
    // key that has RDP configuration, the incoming value may lack derived
    // property values. Merge with the existing cached value so that RDP fields
    // not present in the incoming object are preserved.
    if (
      valueToWrite !== piiTombstone
      && existing?.value
      && this.isScrubRecord(existing.value)
    ) {
      const expectedRdpFields = this.store.objectPiiFieldKeyRegistry
        .getRdpFieldSet(sourcePiiFieldKey);
      if (expectedRdpFields.size > 0) {
        const underlying = valueToWrite[UnderlyingCoachRecord];
        const actualRdpFields = new Set<string>();
        for (const field of expectedRdpFields) {
          if (underlying && field in underlying) {
            actualRdpFields.add(field);
          }
        }

        if (actualRdpFields.size !== expectedRdpFields.size) {
          valueToWrite = mergeObjectFields(
            valueToWrite,
            actualRdpFields,
            expectedRdpFields,
            existing.value,
          );
        }
      }
    }

    batch.write(sourcePiiFieldKey, valueToWrite, status);

    if (value === piiTombstone) {
      batch.changes.deleteObject(sourcePiiFieldKey);
    } else {
      batch.changes.registerObject(sourcePiiFieldKey, value, !existing);
    }

    const metadata = this.store.objectPiiFieldKeyRegistry.getMetadata(
      sourcePiiFieldKey,
    );

    const relatedKeys = metadata
      ? this.store.objectPiiFieldKeyRegistry.getVariants(
        metadata.apiName,
        metadata.piiKey,
      )
      : new Set([sourcePiiFieldKey]);

    for (const targetKey of relatedKeys) {
      if (targetKey === sourcePiiFieldKey || !this.isKeyActive(targetKey)) {
        continue;
      }

      if (value === piiTombstone) {
        batch.write(targetKey, piiTombstone, status);
        batch.changes.deleteObject(targetKey);
        continue;
      }

      const targetCurrentValue = batch.read(targetKey)?.value;
      const targetHolder =
        targetCurrentValue && this.isScrubRecord(targetCurrentValue)
          ? targetCurrentValue
          : undefined;

      // Preserve target-only fields when a partial-select fetch propagates
      // to a sibling variant, so different-select variants converge to the
      // union rather than clobbering each other.
      let merged = value;
      if (selectFields?.size && targetHolder) {
        merged = mergeSelectFields(merged, selectFields, targetHolder);
      }
      merged = this.mergeForTarget(
        merged,
        targetHolder,
        sourcePiiFieldKey,
        targetKey,
      );

      batch.write(targetKey, merged, status);
    }
  }

  /**
   * Check if a cache key is actively observed or pending cleanup.
   * During React unmount-remount cycles, a key may be momentarily
   * unobserved while its cleanup is deferred to a microtask.
   * We still propagate to such keys to prevent stale data when
   * the subscription is re-established.
   */
  private isKeyActive(key: ObjectPiiFieldKey): boolean {
    const subject = this.store.subjects.peek(key);
    if (subject?.observed === true) {
      return true;
    }
    return (this.store.pendingCleanup.get(key) ?? 0) > 0;
  }

  /**
   * Type guard to check if a value is an ScrubRecord
   */
  private isScrubRecord(
    value: ScrubRecord | undefined,
  ): value is ScrubRecord {
    return value != null
      && typeof value === "object"
      && "$apiName" in value
      && "$piiKey" in value;
  }

  /**
   * Merge object data for a specific target cache key, preserving RDP fields
   */
  private mergeForTarget(
    sourceValue: ScrubRecord,
    targetCurrentValue: ScrubRecord | undefined,
    sourcePiiFieldKey: ObjectPiiFieldKey,
    targetPiiFieldKey: ObjectPiiFieldKey,
  ): ScrubRecord {
    const sourceRdpFields = this.store.objectPiiFieldKeyRegistry.getRdpFieldSet(
      sourcePiiFieldKey,
    );
    const targetRdpFields = this.store.objectPiiFieldKeyRegistry.getRdpFieldSet(
      targetPiiFieldKey,
    );

    return mergeObjectFields(
      sourceValue,
      sourceRdpFields,
      targetRdpFields,
      targetCurrentValue,
    );
  }
}
