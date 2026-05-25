let _nextId = 0
export function nextDeferredId(): string { return "deferred_" + (_nextId++) }
export type DeferredId = string
