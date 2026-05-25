export interface TimeSeriesValueBankProperty<T = unknown> {
  getFirstPoint(): Promise<{ time: string; value: T } | undefined>
  getLastPoint(): Promise<{ time: string; value: T } | undefined>
  getAllPoints(query?: unknown): Promise<Array<{ time: string; value: T }>>
  getLatestValue(): Promise<T | undefined>
  streamValues(query?: unknown): AsyncIterable<{ time: string; value: T }>
}
