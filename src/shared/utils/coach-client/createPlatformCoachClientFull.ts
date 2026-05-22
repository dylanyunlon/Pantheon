import { USER_AGENT_HEADER } from '../coach-types'

export interface PlatformCoachClientFull {
  baseUrl: string
  tokenProvider: () => Promise<string>
  fetchFn: typeof globalThis.fetch
}

export function createPlatformCoachClientFull(
  baseUrl: string,
  tokenProvider: () => Promise<string>,
  _options: undefined = undefined,
  fetchFn: typeof globalThis.fetch = fetch
): PlatformCoachClientFull {
  return { baseUrl, tokenProvider, fetchFn }
}
