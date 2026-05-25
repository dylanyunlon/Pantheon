// @ts-nocheck
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

import type {
  DerivedProperty,
  ObjectOrInterfaceDefinition,
  SimplePropertyDef,
} from "../../../coach-types";
import type { DerivedPropertyDefinition } from "../../../coach-types";
import { createWithPropertiesPipelineSet } from "../../derivedProperties/createWithPropertiesPipelineSet";
import type { ScrubNormalized } from "./ScrubNormalized";
import { CachingScrubNormalizer } from "./ScrubNormalizer";

export type Rdp = DerivedProperty.Clause<ObjectOrInterfaceDefinition>;

export class RdpScrubNormalizer extends CachingScrubNormalizer<Rdp, Rdp> {
  private structuralCache = new Map<string, ScrubNormalized<Rdp>>();

  protected lookupOrCreate(rdp: Rdp): ScrubNormalized<Rdp> {
    // Map from builder result symbols to their definitions
    const definitionMap = new Map<
      DerivedProperty.Definition<
        SimplePropertyDef,
        ObjectOrInterfaceDefinition
      >,
      DerivedPropertyDefinition
    >();
    const computedProperties: Record<string, DerivedPropertyDefinition> = {};

    // Create a wrapper holding object type for the builder to let us extract the definition structure
    const piiFieldTypeHolder = {
      type: "object" as const,
      apiName: "__rdp_scrubNormalizer_holder__",
    } as ObjectOrInterfaceDefinition;

    for (const [key, rdpFunction] of Object.entries(rdp)) {
      const builder = createWithPropertiesPipelineSet(
        piiFieldTypeHolder as any,
        { type: "methodInput" },
        definitionMap,
        /* fromBasePipelineSet */ true,
      );

      const result = rdpFunction(builder);
      const definition = definitionMap.get(result);

      if (definition) {
        computedProperties[key] = definition;
      }
    }

    // Sort entries by key for consistent ordering
    const sortedKeys = Object.keys(computedProperties).sort();

    // Create a serialized key for the computed definitions
    const sortedDefinitions: Record<string, DerivedPropertyDefinition> = {};
    for (const key of sortedKeys) {
      sortedDefinitions[key] = computedProperties[key];
    }
    const definitionsKey = JSON.stringify(sortedDefinitions);

    // Check if we already have a scrubNormalized RDP for these definitions
    let scrubNormalized = this.structuralCache.get(definitionsKey);

    if (!scrubNormalized) {
      // Create a scrubNormalized RDP object with sorted keys
      const sortedRdp: Rdp = {};
      for (const key of Object.keys(rdp).sort()) {
        sortedRdp[key] = rdp[key];
      }
      scrubNormalized = sortedRdp as ScrubNormalized<Rdp>;
      this.structuralCache.set(definitionsKey, scrubNormalized);
    }

    return scrubNormalized;
  }
}
