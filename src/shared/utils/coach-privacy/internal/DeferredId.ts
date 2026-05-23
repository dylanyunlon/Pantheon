export type DeferredId = string & { readonly __deferredId: true }
export function createDeferredId(): DeferredId { return crypto.randomUUID() as DeferredId }
