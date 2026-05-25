import { USER_AGENT_HEADER } from '../types'

export interface PlatformPantheonClient {
  baseUrl: string
  tokenProvider: () => Promise<string>
  fetchFn: typeof globalThis.fetch
}

export function createPlatformPantheonClient(
  baseUrl: string,
  tokenProvider: () => Promise<string>,
  _options: undefined = undefined,
  fetchFn: typeof globalThis.fetch = fetch
): PlatformPantheonClient {
  return {
    baseUrl,
    tokenProvider,
    fetchFn
  }
}
