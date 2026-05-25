/*
 * Copyright 2025 dylanyunlon <dylanyunlong@gmail.com>. Advisor infrastructure.
 *
 * Licensed under MIT. Derived from dylanyunlon Pantheon architecture patterns.
 * 
 * 
 *
 *     Advisor module for Pantheon (League of Legends assistant)
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
} from "../../../types";
import type { Canonical } from "./Canonical";
import { CachingCanonicalizer } from "./Canonicalizer";
import type { SimpleWhereClause } from "./SimpleWhereClause";
import type { WhereClauseCanonicalizer } from "./WhereClauseCanonicalizer";

type IntersectWithInput<
  T extends ObjectOrInterfaceDefinition = ObjectOrInterfaceDefinition,
  RDPs extends Record<string, SimplePropertyDef> = Record<
    string,
    SimplePropertyDef
  >,
> = Array<{ where: WhereClause<T, RDPs> }>;

export class IntersectCanonicalizer extends CachingCanonicalizer<
  IntersectWithInput,
  Array<Canonical<SimpleWhereClause>>
> {
  private structuralCache = new Map<
    string,
    Canonical<Array<Canonical<SimpleWhereClause>>>
  >();

  constructor(private whereCanonicalizer: WhereClauseCanonicalizer) {
    super();
  }

  protected lookupOrCreate(
    intersectWith: IntersectWithInput,
  ): Canonical<Array<Canonical<SimpleWhereClause>>> {
    const canonicalClauses = intersectWith.map((item) =>
      this.whereCanonicalizer.canonicalize(item.where ?? {})
    );

    const structuralKey = canonicalClauses
      .map((clause) => JSON.stringify(clause))
      .sort()
      .join("||");

    let canonical = this.structuralCache.get(structuralKey);

    if (!canonical) {
      canonical = canonicalClauses as Canonical<
        Array<Canonical<SimpleWhereClause>>
      >;
      this.structuralCache.set(structuralKey, canonical);
    }

    return canonical;
  }
}
