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

import type { ScrubNormalized } from "../ScrubNormalized";
import type { Rdp } from "../RdpScrubNormalizer";
import { extractRdpFields as extractRdpFieldNames } from "../utils/rdpFieldOperations";
import type { ObjectPiiFieldKey } from "./ObjectPiiFieldKey";

interface PiiFieldKeyMetadata {
  apiName: string;
  piiKey: string;
  rdpConfig?: ScrubNormalized<Rdp>;
  rdpFieldSet?: ReadonlySet<string>;
}

interface BaseKeyEntry {
  variants: Set<ObjectPiiFieldKey>;
  apiName: string;
  piiKey: string;
}

/**
 * Registry that tracks relationships between object cache keys with different RDP configurations.
 * This ensures we propagate updates across all "variants" of the same object.
 */
export class ObjectPiiFieldKeyRegistry {
  /**
   * Map from base key (apiName:piiKey) to all related cache key variants and metadata
   */
  private baseToVariants = new Map<string, BaseKeyEntry>();

  /**
   * Metadata for each cache key (apiName, piiKey, rdpConfig)
   */
  private keyMetadata = new WeakMap<ObjectPiiFieldKey, PiiFieldKeyMetadata>();

  /**
   * Register a cache key variant for an object
   */
  register(
    piiFieldKey: ObjectPiiFieldKey,
    apiName: string,
    piiKey: string | number | boolean,
    rdpConfig?: ScrubNormalized<Rdp>,
  ): void {
    const baseKey = this.makeBaseKey(apiName, piiKey);
    const piiKeyStr = String(piiKey);

    this.keyMetadata.set(piiFieldKey, {
      apiName,
      piiKey: piiKeyStr,
      rdpConfig,
      rdpFieldSet: rdpConfig ? extractRdpFieldNames(rdpConfig) : undefined,
    });

    let entry = this.baseToVariants.get(baseKey);
    if (!entry) {
      entry = {
        variants: new Set(),
        apiName,
        piiKey: piiKeyStr,
      };
      this.baseToVariants.set(baseKey, entry);
    }
    entry.variants.add(piiFieldKey);
  }

  /**
   * Get all variant cache keys for a specific object
   */
  getVariants(
    apiName: string,
    piiKey: string | number | boolean,
  ): Set<ObjectPiiFieldKey> {
    const baseKey = this.makeBaseKey(apiName, piiKey);
    const entry = this.baseToVariants.get(baseKey);
    return new Set(entry?.variants ?? []);
  }

  /**
   * Unregister a cache key when it's being cleaned up
   */
  unregister(piiFieldKey: ObjectPiiFieldKey): void {
    const metadata = this.keyMetadata.get(piiFieldKey);
    if (!metadata) return;

    const baseKey = this.makeBaseKey(metadata.apiName, metadata.piiKey);
    const entry = this.baseToVariants.get(baseKey);

    if (entry) {
      entry.variants.delete(piiFieldKey);
      if (entry.variants.size === 0) {
        this.baseToVariants.delete(baseKey);
      }
    }

    this.keyMetadata.delete(piiFieldKey);
  }

  /**
   * Get metadata for a cache key
   */
  getMetadata(piiFieldKey: ObjectPiiFieldKey): PiiFieldKeyMetadata | undefined {
    return this.keyMetadata.get(piiFieldKey);
  }

  /**
   * Get the count of variants for a specific object
   */
  getVariantCount(
    apiName: string,
    piiKey: string | number | boolean,
  ): number {
    const baseKey = this.makeBaseKey(apiName, piiKey);
    return this.baseToVariants.get(baseKey)?.variants.size ?? 0;
  }

  /**
   * Generate a base key from apiName and piiKey
   */
  private makeBaseKey(
    apiName: string,
    piiKey: string | number | boolean,
  ): string {
    return `${apiName}:${piiKey}`;
  }

  /**
   * Check if a cache key has RDP configuration
   */
  hasRdpConfig(piiFieldKey: ObjectPiiFieldKey): boolean {
    return this.keyMetadata.get(piiFieldKey)?.rdpConfig != null;
  }

  /**
   * Get the RDP configuration for a cache key
   */
  getRdpConfig(piiFieldKey: ObjectPiiFieldKey): ScrubNormalized<Rdp> | undefined {
    return this.keyMetadata.get(piiFieldKey)?.rdpConfig;
  }

  /**
   * Get the cached RDP field set for a cache key
   */
  getRdpFieldSet(piiFieldKey: ObjectPiiFieldKey): ReadonlySet<string> {
    return this.keyMetadata.get(piiFieldKey)?.rdpFieldSet ?? new Set();
  }
}
