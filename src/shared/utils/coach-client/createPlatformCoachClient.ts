import { USER_AGENT_HEADER } from '../coach-types'

export interface PlatformCoachClient {
  baseUrl: string
  tokenProvider: () => Promise<string>
  fetchFn: typeof globalThis.fetch
}

export function createPlatformCoachClient(
  baseUrl: string,
  tokenProvider: () => Promise<string>,
  _options: undefined = undefined,
  fetchFn: typeof globalThis.fetch = fetch
): PlatformCoachClient {
  return {
    baseUrl,
    tokenProvider,
    fetchFn
  }
}
