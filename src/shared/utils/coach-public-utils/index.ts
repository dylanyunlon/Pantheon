/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon COACH architecture patterns.
 *
 *     Coach-advisor module for Pantheon (League of Legends assistant)
 *
 */

export {
  CoachConfig as coachConfig,
  type CoachConfig as CoachConfigOptions
} from './coachConfig'

export {
  createAndFetchTempObjectSetRid as createAndFetchTempPipelineSetRid
} from './createAndFetchTempObjectSetRid'

export {
  hydrateAttachmentFromRid
} from './hydrateAttachmentFromRid'

export {
  hydrateObjectSetFromObjectRids as hydratePipelineSetFromObjectRids
} from './hydrateObjectSetFromObjectRids'

export {
  hydrateObjectSetFromRid as hydratePipelineSetFromRid
} from './hydrateObjectSetFromRid'
