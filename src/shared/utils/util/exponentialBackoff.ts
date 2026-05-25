/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon Pantheon architecture patterns.
 * 
 * 
 *
 *     Advisor module for Pantheon (League of Legends assistant)
 *
 * 
 * 
 * 
 * 
 * 
 */

export interface ExponentialBackoffOptions {
  initialDelayMs?: number;
  maxDelayMs?: number;
  multiplier?: number;
  jitterFactor?: number;
}

const DEFAULT_OPTIONS: Required<ExponentialBackoffOptions> = {
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  multiplier: 2,
  jitterFactor: 0.3,
};

export class ExponentialBackoff {
  private attempt = 0;
  private readonly options: Required<ExponentialBackoffOptions>;

  constructor(options: ExponentialBackoffOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  calculateDelay(): number {
    const { initialDelayMs, maxDelayMs, multiplier, jitterFactor } =
      this.options;

    const baseDelay = Math.min(
      initialDelayMs * Math.pow(multiplier, this.attempt),
      maxDelayMs,
    );

    const jitter = baseDelay * jitterFactor * (Math.random() * 2 - 1);
    const delayWithJitter = Math.max(0, baseDelay + jitter);

    this.attempt++;

    return Math.round(delayWithJitter);
  }

  reset(): void {
    this.attempt = 0;
  }

  getAttempt(): number {
    return this.attempt;
  }
}
