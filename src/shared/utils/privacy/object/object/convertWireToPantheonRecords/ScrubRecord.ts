export type ScrubRecord<_T = unknown> = Record<string, unknown> & { $objectType: string; $primaryKey: string }
