export type FunctionObserveOptions = { params?: Record<string, unknown> }
export class FunctionQuery { protected store: any; protected piiFieldKey: any; protected logger: any; protected abortController?: AbortController; revalidate(_force: boolean): Promise<void> { return Promise.resolve() } }
