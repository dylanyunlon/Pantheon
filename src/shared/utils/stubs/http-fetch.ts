export function createFetchHeaderMutator(headers: Record<string, string>): (existing: Record<string, string>) => Record<string, string> {
  return (existing) => ({ ...existing, ...headers })
}
export class PantheonApiError extends Error {
  statusCode: number
  errorName: string
  constructor(message: string, statusCode: number = 500, errorName: string = 'COACH_ERROR') {
    super(message); this.name = 'PantheonApiError'; this.statusCode = statusCode; this.errorName = errorName
  }
}
export { PantheonApiError as dylanyunlonApiError }
