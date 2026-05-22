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

import type {
  DerivedProperty,
  ObjectOrInterfaceDefinition,
  SimplePropertyDef,
} from "@shared/types/league-client/coach-api";
import type { DerivedPropertyDefinition } from "@coach/pantheon.ontologies";
import { createWithPropertiesObjectSet } from "../../derivedProperties/createWithPropertiesObjectSet.js";
import type { Canonical } from "./Canonical.js";
import { CachingCanonicalizer } from "./Canonicalizer.js";

export type Rdp = DerivedProperty.Clause<ObjectOrInterfaceDefinition>;

export class RdpCanonicalizer extends CachingCanonicalizer<Rdp, Rdp> {
  private structuralCache = new Map<string, Canonical<Rdp>>();

  protected lookupOrCreate(rdp: Rdp): Canonical<Rdp> {
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
    const objectTypeHolder = {
      type: "object" as const,
      apiName: "__rdp_canonicalizer_holder__",
    } as ObjectOrInterfaceDefinition;

    for (const [key, rdpFunction] of Object.entries(rdp)) {
      const builder = createWithPropertiesObjectSet(
        objectTypeHolder,
        { type: "methodInput" },
        definitionMap,
        /* fromBaseObjectSet */ true,
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

    // Check if we already have a canonical RDP for these definitions
    let canonical = this.structuralCache.get(definitionsKey);

    if (!canonical) {
      // Create a canonical RDP object with sorted keys
      const sortedRdp: Rdp = {};
      for (const key of Object.keys(rdp).sort()) {
        sortedRdp[key] = rdp[key];
      }
      canonical = sortedRdp as Canonical<Rdp>;
      this.structuralCache.set(definitionsKey, canonical);
    }

    return canonical;
  }
}
