import type {
  ObjectSet
} from '../types'
import type { PantheonClientFull } from '../client/createPantheonClientFull'
import { getWireObjectSet } from '../pipeline/createObjectSet'

export async function createAndFetchTempObjectSetRid(
  client: PantheonClientFull,
  objectSet: ObjectSet
): Promise<string> {
  const ctx = client._ctx
  const gameStateId = typeof ctx.gameStateId === 'string'
    ? ctx.gameStateId
    : await ctx.gameStateId
  const token = await ctx.tokenProvider()
  const resp = await ctx.fetchFn(
    `${ctx.baseUrl}/api/v2/pantheon/gameStates/${encodeURIComponent(gameStateId)}/objectSets/createTemporary`,
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
