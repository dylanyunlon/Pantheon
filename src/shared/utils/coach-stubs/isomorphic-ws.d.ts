declare module 'isomorphic-ws' {
  export default class WebSocket {
    static readonly CONNECTING: 0
    static readonly OPEN: 1
    static readonly CLOSING: 2
    static readonly CLOSED: 3

    readonly readyState: number
    readonly url: string

    constructor(url: string, protocols?: string | string[])

    close(code?: number, reason?: string): void
    send(data: string | ArrayBuffer | Blob): void

    onopen: ((event: Event) => void) | null
    onclose: ((event: CloseEvent) => void) | null
    onerror: ((event: Event) => void) | null
    onmessage: ((event: MessageEvent) => void) | null

    addEventListener(type: string, listener: EventListener): void
    removeEventListener(type: string, listener: EventListener): void
  }
}
