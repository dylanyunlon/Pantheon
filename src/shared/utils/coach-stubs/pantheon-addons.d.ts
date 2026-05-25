declare module '@dylanyunlon/pantheon-addons' {
  export const tools: {
    getPidsByName(name: string): number[]
    getCommandLine1(pid: number): string
    isElevated(): boolean
    isProcessForeground(pid: number): boolean
    isProcessRunning(pid: number): boolean
    terminateProcess(pid: number): void
    fixWindowMethodA(zoom: number, config?: { baseHeight: number; baseWidth: number }): void
    getLeagueClientWindowPlacementInfo(): {
      left: number
      top: number
      right: number
      bottom: number
      width: number
      height: number
      showCmd: number
    }
  }

  export interface KeyEvent {
    vkCode: number
    keyCode: number
    keyId: string
    isKeyUp: boolean
    isKeyDown: boolean
    isDown: boolean
    isModifier: boolean
    isCommonModifier: boolean
  }

  export namespace input {
    export type KeyEvent = import('@dylanyunlon/pantheon-addons').KeyEvent
  }

  export const input: {
    instance: {
      install(): void
      uninstall(): void
      on(event: 'keyEvent', handler: (key: KeyEvent) => void): void
      sendKey(keyCode: number, down: boolean): Promise<void>
      sendString(str: string): Promise<void>
    }
    VKEY_MAP: Record<number | string, { keyId: string; vkCode: number }>
    UNIFIED_KEY_ID: Record<number, string>
    isModifierKey(key: number | string): boolean
  }
}
