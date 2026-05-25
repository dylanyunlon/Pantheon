export interface TimeSeriesPropertyV2<T = unknown> {
  getFirstPoint(): Promise<{ time: string; value: T } | undefined>
  getLastPoint(): Promise<{ time: string; value: T } | undefined>
  getAllPoints(query?: unknown): Promise<Array<{ time: string; value: T }>>
  getRange(range: { startTime: string; endTime: string }): Promise<Array<{ time: string; value: T }>>
  streamPoints(query?: unknown): AsyncIterable<{ time: string; value: T }>
}
