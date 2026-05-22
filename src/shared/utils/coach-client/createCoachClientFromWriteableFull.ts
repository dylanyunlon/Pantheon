import type { CoachClientFull } from './createCoachClientFull'
import { coachClientSymbol, createCoachClientFullWithTransaction } from './createCoachClientFull'

export function createCoachClientFromWriteableFull(
  writeableClient: CoachClientFull,
  options?: {
    transactionId?: string
    baseUrl?: string
    gameStateId?: string | Promise<string>
    tokenProvider?: () => Promise<string>
  }
): CoachClientFull {
  const ctx = writeableClient._ctx

  if (ctx.transactionId === undefined || ctx.flushEdits === undefined) {
    throw new Error(
      'createCoachClientFromWriteableFull: provided client has no active transaction'
    )
  }

  return createCoachClientFullWithTransaction(
    options?.transactionId ?? ctx.transactionId,
    ctx.flushEdits,
    options?.baseUrl ?? ctx.baseUrl,
    options?.gameStateId ?? ctx.gameStateId,
    options?.tokenProvider ?? ctx.tokenProvider
  )
}
