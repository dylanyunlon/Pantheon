import type { PiiFieldKey } from './PiiFieldKey'
export interface PiiFieldKeys { get<T extends PiiFieldKey>(...args: unknown[]): T; retain(k: PiiFieldKey): void; release(k: PiiFieldKey): void }
