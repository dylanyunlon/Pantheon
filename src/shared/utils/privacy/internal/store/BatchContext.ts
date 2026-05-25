export interface BatchContext {
  changes: any
  createLayerIfNeeded: () => void
  optimisticWrite: boolean
  write: (k: unknown, v: unknown, status: string) => { value: any; status: string }
  read: (k: unknown) => { value: any; status: string } | undefined
  delete: (k: unknown, status: string) => { value: any; status: string }
  deferredWrite?: boolean
}
