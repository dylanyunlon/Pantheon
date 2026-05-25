declare const window: any
declare const document: any

function isProduction(): boolean {
  try {
    return typeof window !== 'undefined'
      && window.location.hostname !== 'localhost'
      && !window.location.hostname.startsWith('127.')
  } catch {
    return false
  }
}

export function getMetaTagContent(name: string): string {
  if (typeof document === 'undefined') return ''
  const meta = document.querySelector(`meta[name="${name}"]`)
  return meta?.getAttribute('content') || ''
}

export interface PantheonConfig {
  baseUrl: string
  gameStateId: string
  clientId: string
}

function getGameStateId(gameStateId: string): string {
  return isProduction() ? getMetaTagContent('pantheon-gameStateId') : gameStateId
}

export function getPantheonConfig(gameStateId: string): PantheonConfig {
  if (isProduction()) {
    return {
      baseUrl: getMetaTagContent('pantheon-baseUrl'),
      clientId: getMetaTagContent('pantheon-clientId'),
      gameStateId: getGameStateId(gameStateId)
    }
  }
  return {
    baseUrl: import.meta?.env?.VITE_PANTHEON_URL ?? 'http://localhost:8080',
    clientId: import.meta?.env?.VITE_PANTHEON_CLIENT_ID ?? '',
    gameStateId: getGameStateId(gameStateId)
  }
}

export const appConfig = getPantheonConfig
export type PantheonConfigOptions = PantheonConfig
