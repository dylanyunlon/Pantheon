import { USER_AGENT_HEADER } from '../types'

export interface PlatformPantheonClientFull {
  baseUrl: string
  tokenProvider: () => Promise<string>
  fetchFn: typeof globalThis.fetch
}

export function createPlatformPantheonClientFull(
  baseUrl: string,
  tokenProvider: () => Promise<string>,
  _options: undefined = undefined,
  fetchFn: typeof globalThis.fetch = fetch
): PlatformPantheonClientFull {
  return { baseUrl, tokenProvider, fetchFn }
}
