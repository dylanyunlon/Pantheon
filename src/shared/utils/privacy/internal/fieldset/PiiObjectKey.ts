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

import type { PiiFieldTypeDefinition, PiiKeyType } from "../../../types";
import type { ScrubRecord } from "../../../object/convertWireToPantheonRecords/ScrubRecord";
import type { PiiFieldKey } from "../PiiFieldKey";
import type { ScrubNormalized } from "../ScrubNormalized";
import type { Rdp } from "../RdpScrubNormalizer";
import type { ObjectQuery } from "./ObjectQuery";

// Index constants for accessing otherKeys array elements
export const API_NAME_IDX = 0;
export const PK_IDX = 1;
export const RDP_CONFIG_IDX = 2;
export const SELECT_IDX = 3;
export const LOAD_PROPERTY_SECURITY_IDX = 4;
export const INCLUDE_ALL_BASE_PROPERTIES_IDX = 5;

export interface ObjectPiiFieldKey extends
  PiiFieldKey<
    "object",
    ScrubRecord,
    ObjectQuery,
    [
      apiName: string,
      pk: PiiKeyType<PiiFieldTypeDefinition>,
      rdpConfig?: ScrubNormalized<Rdp> | undefined,
      select?: ScrubNormalized<readonly string[]> | undefined,
      loadPropertySecurity?: true | undefined,
      includeAllBaseObjectProperties?: true | undefined,
    ]
  >
{
}
