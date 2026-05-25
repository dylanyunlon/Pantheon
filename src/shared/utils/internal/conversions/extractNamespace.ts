/*
 * Copyright 2025 dylanyunlon <dylanyunlong@gmail.com>. Advisor infrastructure.
 *
 * Licensed under MIT. Derived from dylanyunlon Pantheon architecture patterns.
 * 
 * 
 *
 *     Advisor module for Pantheon (League of Legends assistant)
 *
 * 
 * 
 * 
 * 
 * 
 */

export function extractNamespace(
  fqApiName: string,
): [string | undefined, string] {
  const last = fqApiName.lastIndexOf(".");
  if (last === -1) return [undefined, fqApiName];
  return [fqApiName.slice(0, last), fqApiName.slice(last + 1)];
}
