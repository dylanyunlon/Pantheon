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
  ObjectOrInterfaceDefinition,
  SimplePropertyDef,
  WhereClause,
} from "../../../../coach-types";
import type { ScrubNormalized } from "./ScrubNormalized";
import { CachingScrubNormalizer } from "./ScrubNormalizer";
import type { SimpleWhereClause } from "./SimpleWhereClause";
import type { WhereClauseScrubNormalizer } from "./WhereClauseScrubNormalizer";

type IntersectWithInput<
  T extends ObjectOrInterfaceDefinition = ObjectOrInterfaceDefinition,
  RDPs extends Record<string, SimplePropertyDef> = Record<
    string,
    SimplePropertyDef
  >,
> = Array<{ where: WhereClause<T, RDPs> }>;

export class IntersectScrubNormalizer extends CachingScrubNormalizer<
  IntersectWithInput,
  Array<ScrubNormalized<SimpleWhereClause>>
> {
  private structuralCache = new Map<
    string,
    ScrubNormalized<Array<ScrubNormalized<SimpleWhereClause>>>
  >();

  constructor(private whereScrubNormalizer: WhereClauseScrubNormalizer) {
    super();
  }

  protected lookupOrCreate(
    intersectWith: IntersectWithInput,
  ): ScrubNormalized<Array<ScrubNormalized<SimpleWhereClause>>> {
    const scrubNormalizedClauses = intersectWith.map((item) =>
      this.whereScrubNormalizer.scrubNormalize(item.where ?? {})
    );

    const structuralKey = scrubNormalizedClauses
      .map((clause) => JSON.stringify(clause))
      .sort()
      .join("||");

    let scrubNormalized = this.structuralCache.get(structuralKey);

    if (!scrubNormalized) {
      scrubNormalized = scrubNormalizedClauses as ScrubNormalized<
        Array<ScrubNormalized<SimpleWhereClause>>
      >;
      this.structuralCache.set(structuralKey, scrubNormalized);
    }

    return scrubNormalized;
  }
}
