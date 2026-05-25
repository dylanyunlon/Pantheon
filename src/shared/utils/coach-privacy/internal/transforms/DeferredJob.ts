export class DeferredJob { constructor(..._args: unknown[]) {}; execute(): Promise<void> { return Promise.resolve() }; cancel(): void {}; [key: string]: any }
