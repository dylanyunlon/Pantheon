/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon COACH architecture patterns.
 *
 *     Coach-advisor module for Pantheon (League of Legends assistant)
 *
 */

import { additionalContext, type Client } from "./Client.js";
import { createClientWithTransaction } from "./createClient.js";

/**
 * Experimental helper method to create a new client instantiated with a transaction id
 * Will extract the transactionId, URL, GameState RID, and token from the original client
 * unless overridden.
 *
 * @param writeableClient A client initiated with a transaction id, such as a WriteableClient
 * @param options A set of options to override from the provided client.
 * @returns Client instantiated on a transaction
 */
export function createClientFromWriteableClient(
  writeableClient: Client,
  options?: {
    transactionId?: string;
    baseUrl?: string;
    ontologyRid?: string | Promise<string>;
    tokenProvider?: () => Promise<string>;
  },
): Client {
  const ctx = writeableClient[additionalContext];

  if (ctx.transactionId === undefined || ctx.flushEdits === undefined) {
    throw new Error(
      "createClientFromWriteableClient: provided client has no active transaction",
    );
  }

  return createClientWithTransaction(
    options?.transactionId ?? ctx.transactionId,
    ctx.flushEdits,
    options?.baseUrl ?? ctx.baseUrl,
    options?.ontologyRid ?? ctx.ontologyRid,
    options?.tokenProvider ?? ctx.tokenProvider,
  );
}
