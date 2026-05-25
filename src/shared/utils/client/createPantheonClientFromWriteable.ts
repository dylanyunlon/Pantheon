import type { PantheonClient } from './PantheonClient'
import { clientContext } from './PantheonClient'
import { createPantheonClientWithTransaction } from './createPantheonClient'

export function createPantheonClientFromWriteable(
  writeableClient: PantheonClient,
  options?: {
    transactionId?: string
    baseUrl?: string
    engineVersion?: string
    tokenProvider?: () => Promise<string>
  }
): PantheonClient {
  const ctx = writeableClient.context

  if (ctx.transactionId === undefined || ctx.flushEdits === undefined) {
    throw new Error(
      'createPantheonClientFromWriteable: provided client has no active transaction'
    )
  }

  return createPantheonClientWithTransaction(
    options?.transactionId ?? ctx.transactionId,
    ctx.flushEdits,
    options?.baseUrl ?? ctx.baseUrl,
    options?.engineVersion ?? '1.0.0',
    options?.tokenProvider ?? ctx.tokenProvider
  )
}
