import type { PantheonClientFull } from './createPantheonClientFull'
import { coachClientSymbol, createPantheonClientFullWithTransaction } from './createPantheonClientFull'

export function createPantheonClientFromWriteableFull(
  writeableClient: PantheonClientFull,
  options?: {
    transactionId?: string
    baseUrl?: string
    gameStateId?: string | Promise<string>
    tokenProvider?: () => Promise<string>
  }
): PantheonClientFull {
  const ctx = writeableClient._ctx

  if (ctx.transactionId === undefined || ctx.flushEdits === undefined) {
    throw new Error(
      'createPantheonClientFromWriteableFull: provided client has no active transaction'
    )
  }

  return createPantheonClientFullWithTransaction(
    options?.transactionId ?? ctx.transactionId,
    ctx.flushEdits,
    options?.baseUrl ?? ctx.baseUrl,
    options?.gameStateId ?? ctx.gameStateId,
    options?.tokenProvider ?? ctx.tokenProvider
  )
}
