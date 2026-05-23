declare module 'chalk' {
  export class Chalk {
    constructor(options?: { level?: number })
    red(str: string): string
    green(str: string): string
    blue(str: string): string
    yellow(str: string): string
    gray(str: string): string
    bold(str: string): string
    dim(str: string): string
    underline(str: string): string
  }
  const chalk: Chalk
  export default chalk
}
