export interface SortingStrategy {
  sortPiiFieldKeys(keys: unknown[], batch: unknown): unknown[]
  compare?(a: unknown, b: unknown): number
}
export class DefaultSortingStrategy implements SortingStrategy {
  sortPiiFieldKeys(keys: unknown[]): unknown[] { return keys }
}
