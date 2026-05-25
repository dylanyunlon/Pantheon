import type {
  ObjectSet
} from '../coach-types'
import type { CoachClientFull } from '../coach-client/createCoachClientFull'
import { getWireObjectSet } from '../coach-pipeline/createObjectSet'

export async function createAndFetchTempObjectSetRid(
  client: CoachClientFull,
  objectSet: ObjectSet
): Promise<string> {
  const ctx = client._ctx
  const gameStateId = typeof ctx.gameStateId === 'string'
    ? ctx.gameStateId
    : await ctx.gameStateId
  const token = await ctx.tokenProvider()
  const resp = await ctx.fetchFn(
    `${ctx.baseUrl}/api/v2/coach/gameStates/${encodeURIComponent(gameStateId)}/objectSets/createTemporary`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ objectSet: getWireObjectSet(objectSet) })
    }
  )
  if (!resp.ok) throw new Error(`createAndFetchTempObjectSetRid failed: ${resp.status}`)
  const data = await resp.json()
  return (data as any).objectSetRid
}
