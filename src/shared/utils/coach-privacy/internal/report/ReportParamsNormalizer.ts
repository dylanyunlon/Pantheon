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

import type { PipelineSet as WirePipelineSet } from "../../../../../coach-types";
import { Trie } from "@wry/trie";
import {
  getWirePipelineSet,
  isPipelineSet,
} from "../../../pipelineSet/createPipeline";
import { isObjectSpecifiersObject } from "../../../util/isObjectSpecifiersObject";
import type { ScrubNormalized } from "../ScrubNormalized";

export type ScrubNormalizedFunctionParams = Record<string, ScrubNormalizedValue>;

type PrimitiveValue = string | number | boolean | bigint | null | undefined;

type CoachRecordRef = { $apiName: string; $piiKey: string | number };

type ScrubNormalizedValue =
  | PrimitiveValue
  | CoachRecordRef
  | WirePipelineSet
  | ScrubNormalizedValue[]
  | [ScrubNormalizedValue, ScrubNormalizedValue][]
  | { [key: string]: ScrubNormalizedValue };

type PathElement = PrimitiveValue | WirePipelineSet;

// Path markers use "$:" prefix. User data with this prefix is unlikely but could
// theoretically cause collisions if it matches the exact marker sequence.
function isPrimitiveValue(value: unknown): value is PrimitiveValue {
  if (value == null) return true;
  const t = typeof value;
  return t === "string" || t === "number" || t === "boolean" || t === "bigint";
}

export class FunctionParamsScrubNormalizer {
  #inputCache = new WeakMap<
    Record<string, unknown>,
    ScrubNormalized<ScrubNormalizedFunctionParams>
  >();
  #trie = new Trie<object>(false);
  #scrubNormalizedByMarker = new WeakMap<
    object,
    ScrubNormalized<ScrubNormalizedFunctionParams>
  >();

  public scrubNormalize(
    params: Record<string, unknown> | undefined | null,
  ): ScrubNormalized<ScrubNormalizedFunctionParams> | undefined {
    if (params == null) {
      return undefined;
    }

    if (this.#inputCache.has(params)) {
      return this.#inputCache.get(params);
    }

    const seen = new WeakSet<object>();
    const path: PathElement[] = [];
    const scrubNormalizedValue = this.#encodeAndBuild(
      params,
      path,
      seen,
    ) as ScrubNormalizedFunctionParams;

    const marker = this.#trie.lookupArray(path);
    let scrubNormalized = this.#scrubNormalizedByMarker.get(marker);
    if (scrubNormalized === undefined) {
      scrubNormalized = scrubNormalizedValue as ScrubNormalized<ScrubNormalizedFunctionParams>;
      this.#scrubNormalizedByMarker.set(marker, scrubNormalized);
    }

    this.#inputCache.set(params, scrubNormalized);
    return scrubNormalized;
  }

  #encodeAndBuild(
    value: unknown,
    path: PathElement[],
    seen: WeakSet<object>,
  ): ScrubNormalizedValue {
    if (value == null) {
      path.push(value);
      return value;
    }

    if (isPrimitiveValue(value)) {
      path.push(value);
      return value;
    }

    // Poor man's circular reference detection, we should improve this if this turns into a problem
    if (seen.has(value as object)) {
      throw new Error("Circular reference in function parameters");
    }
    seen.add(value as object);

    if (value instanceof Date) {
      const iso = value.toISOString();
      path.push("$:date", iso);
      return iso;
    }

    if (Array.isArray(value)) {
      path.push("$:array");
      const arr = value.map(item => this.#encodeAndBuild(item, path, seen));
      path.push("$:array_end");
      return arr;
    }

    if (value instanceof Set) {
      path.push("$:set");
      const sorted = this.#sortSetValues(Array.from(value));
      const arr = sorted.map(item => this.#encodeAndBuild(item, path, seen));
      path.push("$:set_end");
      return arr;
    }

    if (value instanceof Map) {
      path.push("$:map");
      const sorted = this.#sortMapEntries(Array.from(value.entries()));
      const arr: [ScrubNormalizedValue, ScrubNormalizedValue][] = sorted.map(([k, v]) => [
        this.#encodeAndBuild(k, path, seen),
        this.#encodeAndBuild(v, path, seen),
      ]);
      path.push("$:map_end");
      return arr;
    }

    if (isObjectSpecifiersObject(value)) {
      const piiFieldType = value.$piiFieldType ?? value.$apiName;
      path.push("$:coach", piiFieldType, value.$piiKey);
      return { $apiName: piiFieldType, $piiKey: value.$piiKey };
    }

    if (isPipelineSet(value)) {
      const wire = JSON.stringify(getWirePipelineSet(value));
      path.push("$:objectset", wire);
      return wire;
    }

    const obj = value as Record<string, unknown>;
    path.push("$:object");
    const scrubNormalized: Record<string, ScrubNormalizedValue> = {};
    for (const key of Object.keys(obj).sort()) {
      path.push(key);
      scrubNormalized[key] = this.#encodeAndBuild(obj[key], path, seen);
    }
    path.push("$:object_end");
    return scrubNormalized;
  }

  #comparePrimitives(a: PrimitiveValue, b: PrimitiveValue): number {
    const ta = typeof a;
    const tb = typeof b;
    if (ta !== tb) return ta.localeCompare(tb);
    if (ta === "string") return (a as string).localeCompare(b as string);
    if (ta === "number") {
      const an = a as number;
      const bn = b as number;
      if (Number.isNaN(an) && Number.isNaN(bn)) return 0;
      if (Number.isNaN(an)) return 1;
      if (Number.isNaN(bn)) return -1;
      return an - bn;
    }
    if (ta === "boolean") return (a ? 1 : 0) - (b ? 1 : 0);
    if (ta === "bigint") {
      const ab = a as bigint;
      const bb = b as bigint;
      return ab < bb ? -1 : ab > bb ? 1 : 0;
    }
    return 0;
  }

  #sortSetValues<T>(items: T[]): T[] {
    return items.slice().sort((a, b) => {
      if (isPrimitiveValue(a) && isPrimitiveValue(b)) {
        return this.#comparePrimitives(a, b);
      }
      return JSON.stringify(a).localeCompare(JSON.stringify(b));
    });
  }

  #sortMapEntries<K, V>(entries: [K, V][]): [K, V][] {
    return entries.slice().sort(([a], [b]) => {
      if (isPrimitiveValue(a) && isPrimitiveValue(b)) {
        return this.#comparePrimitives(a, b);
      }
      return JSON.stringify(a).localeCompare(JSON.stringify(b));
    });
  }
}
