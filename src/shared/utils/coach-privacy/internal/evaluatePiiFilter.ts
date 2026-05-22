import type { PiiFilterType } from "../PiiFieldRegistry"

export function evaluatePiiFilter(
  f: PiiFilterType,
  realValue: any,
  expected: any,
  strict: boolean,
): boolean {
  switch (f) {
    case "$eq":
      return realValue === expected
    case "$gt":
      return realValue > expected
    case "$lt":
      return realValue < expected
    case "$gte":
      return realValue >= expected
    case "$lte":
      return realValue <= expected
    case "$ne":
      return realValue !== expected
    case "$in":
      return Array.isArray(expected) && expected.includes(realValue)
    case "$isNull":
      return realValue == null
    case "$startsWith":
      return typeof realValue === "string" && realValue.startsWith(expected)
    case "$contains":
      return typeof realValue === "string" && realValue.includes(expected)
    case "$matchesPuuid":
      return typeof realValue === "string" && /^[a-f0-9-]{30,80}$/i.test(realValue)
    case "$matchesSummonerName":
      return typeof realValue === "string" && realValue.length >= 3 && realValue.length <= 16
    case "$matchesAccountId":
      return typeof realValue === "string" && /^\d{5,20}$/.test(realValue)
    case "$matchesTagLine":
      return typeof realValue === "string" && /^[A-Za-z0-9]{2,5}$/.test(realValue)
    case "$matchesSessionKey":
      return typeof realValue === "string" && /^[a-f0-9-]+:[A-Z_]+$/.test(realValue)
    case "$interval":
    case "$matchesRegex":
      return !strict
    default:
      return !strict
  }
}

export function evaluatePiiFieldName(
  fieldName: string,
  patterns: RegExp[],
): boolean {
  for (const pattern of patterns) {
    if (pattern.test(fieldName)) return true
  }
  return false
}

export function evaluatePiiValueHeuristic(
  value: unknown,
): { isPii: boolean; piiType: string } {
  if (typeof value !== "string") return { isPii: false, piiType: "none" }
  if (/^[a-f0-9-]{36,80}$/i.test(value)) return { isPii: true, piiType: "puuid" }
  if (/^[a-f0-9]{40,64}$/i.test(value)) return { isPii: true, piiType: "hash_id" }
  if (/^\d{5,20}$/.test(value)) return { isPii: true, piiType: "account_id" }
  if (/@/.test(value) && /\.\w{2,}$/.test(value)) return { isPii: true, piiType: "email" }
  return { isPii: false, piiType: "none" }
}
