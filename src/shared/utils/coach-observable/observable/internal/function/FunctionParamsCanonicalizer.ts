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

import type { PipelineSet as WirePipelineSet } from "../../../../../coach-types";
import { Trie } from "@wry/trie";
import {
  getWirePipelineSet,
  isPipelineSet,
} from "../../../pipelineSet/createPipeline";
import { isObjectSpecifiersObject } from "../../../util/isObjectSpecifiersObject";
import type { Canonical } from "../Canonical";

export type CanonicalFunctionParams = Record<string, CanonicalValue>;

type PrimitiveValue = string | number | boolean | bigint | null | undefined;

type CoachRecordRef = { $apiName: string; $primaryKey: string | number };

type CanonicalValue =
  | PrimitiveValue
  | CoachRecordRef
  | WirePipelineSet
  | CanonicalValue[]
  | [CanonicalValue, CanonicalValue][]
  | { [key: string]: CanonicalValue };

type PathElement = PrimitiveValue | WirePipelineSet;

// Path markers use "$:" prefix. User data with this prefix is unlikely but could
// theoretically cause collisions if it matches the exact marker sequence.
function isPrimitiveValue(value: unknown): value is PrimitiveValue {
  if (value == null) return true;
  const t = typeof value;
  return t === "string" || t === "number" || t === "boolean" || t === "bigint";
}

export class FunctionParamsCanonicalizer {
  #inputCache = new WeakMap<
    Record<string, unknown>,
    Canonical<CanonicalFunctionParams>
  >();
  #trie = new Trie<object>(false);
  #canonicalByMarker = new WeakMap<
    object,
    Canonical<CanonicalFunctionParams>
  >();

  public canonicalize(
    params: Record<string, unknown> | undefined | null,
  ): Canonical<CanonicalFunctionParams> | undefined {
    if (params == null) {
      return undefined;
    }

    if (this.#inputCache.has(params)) {
      return this.#inputCache.get(params);
    }

    const seen = new WeakSet<object>();
    const path: PathElement[] = [];
    const canonicalValue = this.#encodeAndBuild(
      params,
      path,
      seen,
    ) as CanonicalFunctionParams;

    const marker = this.#trie.lookupArray(path);
    let canonical = this.#canonicalByMarker.get(marker);
    if (canonical === undefined) {
      canonical = canonicalValue as Canonical<CanonicalFunctionParams>;
      this.#canonicalByMarker.set(marker, canonical);
    }

    this.#inputCache.set(params, canonical);
    return canonical;
  }

  #encodeAndBuild(
    value: unknown,
    path: PathElement[],
    seen: WeakSet<object>,
  ): CanonicalValue {
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
      const arr: [CanonicalValue, CanonicalValue][] = sorted.map(([k, v]) => [
        this.#encodeAndBuild(k, path, seen),
        this.#encodeAndBuild(v, path, seen),
      ]);
      path.push("$:map_end");
      return arr;
    }

    if (isObjectSpecifiersObject(value)) {
      const objectType = value.$objectType ?? value.$apiName;
      path.push("$:coach", objectType, value.$primaryKey);
      return { $apiName: objectType, $primaryKey: value.$primaryKey };
    }

    if (isPipelineSet(value)) {
      const wire = JSON.stringify(getWirePipelineSet(value));
      path.push("$:objectset", wire);
      return wire;
    }

    const obj = value as Record<string, unknown>;
    path.push("$:object");
    const canonical: Record<string, CanonicalValue> = {};
    for (const key of Object.keys(obj).sort()) {
      path.push(key);
      canonical[key] = this.#encodeAndBuild(obj[key], path, seen);
    }
    path.push("$:object_end");
    return canonical;
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
