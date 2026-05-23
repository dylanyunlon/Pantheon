export class ExponentialBackoff {
  private attempt = 0
  private readonly baseDelay: number
  private readonly maxDelay: number

  constructor(opts?: { baseDelay?: number; maxDelay?: number }) {
    this.baseDelay = opts?.baseDelay ?? 1000
    this.maxDelay = opts?.maxDelay ?? 30000
  }

  next(): number { return this.calculateDelay() }

  calculateDelay(): number {
    const delay = Math.min(this.baseDelay * Math.pow(2, this.attempt), this.maxDelay)
    this.attempt++
    return delay
  }

  getAttempt(): number { return this.attempt }

  reset(): void { this.attempt = 0 }
}
