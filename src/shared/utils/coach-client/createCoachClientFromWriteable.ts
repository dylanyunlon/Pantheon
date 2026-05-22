import type { CoachClient } from './CoachClient'
import { coachClientContext } from './CoachClient'
import { createCoachClientWithTransaction } from './createCoachClient'

export function createCoachClientFromWriteable(
  writeableClient: CoachClient,
  options?: {
    transactionId?: string
    baseUrl?: string
    engineVersion?: string
    tokenProvider?: () => Promise<string>
  }
): CoachClient {
  const ctx = writeableClient.context

  if (ctx.transactionId === undefined || ctx.flushEdits === undefined) {
    throw new Error(
      'createCoachClientFromWriteable: provided client has no active transaction'
    )
  }

  return createCoachClientWithTransaction(
    options?.transactionId ?? ctx.transactionId,
    ctx.flushEdits,
    options?.baseUrl ?? ctx.baseUrl,
    options?.engineVersion ?? '1.0.0',
    options?.tokenProvider ?? ctx.tokenProvider
  )
}
