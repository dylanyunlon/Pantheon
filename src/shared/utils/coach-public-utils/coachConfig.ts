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

export interface CoachConfig {
  baseUrl: string
  gameStateId: string
  clientId: string
}

function getGameStateId(gameStateId: string): string {
  return isProduction() ? getMetaTagContent('coach-gameStateId') : gameStateId
}

export function getCoachConfig(gameStateId: string): CoachConfig {
  if (isProduction()) {
    return {
      baseUrl: getMetaTagContent('coach-baseUrl'),
      clientId: getMetaTagContent('coach-clientId'),
      gameStateId: getGameStateId(gameStateId)
    }
  }
  return {
    baseUrl: import.meta?.env?.VITE_COACH_URL ?? 'http://localhost:8080',
    clientId: import.meta?.env?.VITE_COACH_CLIENT_ID ?? '',
    gameStateId: getGameStateId(gameStateId)
  }
}

export const coachConfig = CoachConfig
export type CoachConfigOptions = Parameters<typeof CoachConfig>[0]
