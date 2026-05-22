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

import type { Canonical } from "./Canonical";

/**
 * Interface for canonicalizing objects.
 */
export interface Canonicalizer<TInput, TCanonical> {
  /**
   * Canonicalizes the input object. Returns the same reference for
   * structurally identical inputs.
   */
  canonicalize(input: TInput | undefined): Canonical<TCanonical> | undefined;
}

/**
 * Base class for canonicalizers that provides common caching infrastructure.
 * Subclasses control how structural deduplication is performed.
 */
export abstract class CachingCanonicalizer<TInput extends object, TCanonical>
  implements Canonicalizer<TInput, TCanonical>
{
  /**
   * Cache for input object identity.
   */
  protected inputCache: WeakMap<TInput, Canonical<TCanonical>> = new WeakMap<
    TInput,
    Canonical<TCanonical>
  >();

  /**
   * Look up or create a canonical form for the given input.
   * This method handles the structural deduplication logic.
   *
   * @param input The input to canonicalize
   * @returns The canonical form
   */
  protected abstract lookupOrCreate(input: TInput): Canonical<TCanonical>;

  canonicalize(input: TInput): Canonical<TCanonical>;
  canonicalize(input: TInput | undefined): Canonical<TCanonical> | undefined;
  canonicalize(input: TInput | undefined): Canonical<TCanonical> | undefined {
    if (!input) {
      return undefined;
    }
    if (this.inputCache.has(input)) {
      return this.inputCache.get(input)!;
    }

    const canonical = this.lookupOrCreate(input);
    this.inputCache.set(input, canonical);

    return canonical;
  }
}
