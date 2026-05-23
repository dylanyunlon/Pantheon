import type { Logger } from '../../../coach-types'
export interface Store { client: any; logger?: Logger; queries: any; subjects: any; objects: any; batch: any; objectPiiFieldKeyRegistry: any; piiFieldKeys: any; pendingCleanup: Map<unknown, number>; whereScrubNormalizer: any; selectScrubNormalizer: any }
