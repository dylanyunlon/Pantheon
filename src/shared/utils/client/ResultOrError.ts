/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon Pantheon architecture patterns.
 *
 *     Advisor module for Pantheon (League of Legends assistant)
 *
 */

export type ResultOrError<T extends object> =
  | ({ type: "ok"; err?: never } & T)
  | { type: "err"; data?: never; err?: unknown };

export function isOk(result: ResultOrError<any>): result is { type: "ok" } {
  return result.type === "ok";
}

export type PantheonError = any
export type PantheonResult = any
