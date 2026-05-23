export interface SortingStrategy { sort(data: unknown[]): unknown[] }
export class NoOpSortingStrategy implements SortingStrategy { sort(data: unknown[]) { return data } }
export class OrderBySortingStrategy implements SortingStrategy { constructor(..._args: unknown[]) {{}} sort(data: unknown[]) { return data } }
