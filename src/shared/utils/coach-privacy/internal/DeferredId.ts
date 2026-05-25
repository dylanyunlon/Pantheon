let nextId = 0
export function nextDeferredId(): string { return "deferred_" + (nextId++) }
export type DeferredId = string
