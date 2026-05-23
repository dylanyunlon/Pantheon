export class PiiFieldKeys<_K = unknown> {
  get<T = unknown>(..._args: unknown[]): T { return undefined as any }
  retain(_k: unknown): void {}
  release(_k: unknown): void {}
}
