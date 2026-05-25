/*
 * Copyright 2025 dylanyunlon <dylanyunlong@gmail.com>. Coach-privacy PII compliance infrastructure.
 *
 * Licensed under MIT. Derived from dylanyunlon Pantheon architecture patterns.
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

import type { InterfaceHolder } from "../../../object/convertWireToPantheonRecords/InterfaceHolder";
import type { ScrubRecord } from "../../../object/convertWireToPantheonRecords/ScrubRecord";
import type { Status } from "../../PrivacyScrubClient/common";
import { type ObjectPiiFieldKey } from "../object/ObjectPiiFieldKey";

/**
 * Abstract base for ScrubFieldQuery and SpecificLinkQuery.
 * - Stores object references, not duplicates
 * - Implements shared pagination and reference counting
 * - Template method pattern for collection operations
 */
export interface CollectionStorageData {
  data: ObjectPiiFieldKey[];
  totalCount?: string;
}

/**
 * Base interface for collection-based payloads (scrubFields and links)
 * Contains the common properties shared by all collection payload types
 */
export interface BaseCollectionPayload {
  /**
   * The resolved collection of objects, or undefined if no data has been loaded yet
   */
  resolvedScrubField: Array<ScrubRecord | InterfaceHolder> | undefined;

  /**
   * Whether the data is from an deferred update
   */
  isDeferred: boolean;

  /**
   * Function to fetch more items when available
   */
  fetchMore: () => Promise<void>;

  /**
   * Whether there are more items available to fetch
   */
  hasMore: boolean;

  /**
   * Current loading status
   */
  status: Status;

  /**
   * Timestamp of when the data was last updated
   */
  lastUpdated: number;

  totalCount?: string;
}

/**
 * Common parameters available for constructing a collection payload
 */
export interface CollectionConnectableParams {
  /**
   * Array of resolved objects, or undefined if no data has been loaded yet
   */
  resolvedData: any[] | undefined;

  /**
   * Whether the data is from an deferred update
   */
  isDeferred: boolean;

  /**
   * Current loading status
   */
  status: Status;

  /**
   * Timestamp of the last update
   */
  lastUpdated: number;

  totalCount?: string;
}
