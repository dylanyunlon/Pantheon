/*
 * Copyright 2025 dylanyunlon <dylanyunlong@gmail.com>. Coach-advisor infrastructure.
 *
 * Licensed under MIT. Derived from dylanyunlon COACH architecture patterns.
 * 
 * 
 *
 *     Coach-advisor module for Pantheon (League of Legends assistant)
 *
 * 
 * 
 * 
 * 
 * 
 */

import type { Logger } from "@shared/types/league-client/coach-api";
import { Chalk } from "chalk";
import { vi } from "vitest";
import { BaseLogger } from "./BaseLogger.js";

const chalk = new Chalk(); // new Chalk({ level: 3 });

const colors = {
  debug: [chalk.cyan, chalk.bgCyan],
  info: [chalk.green, chalk.bgGreen],
  trace: [chalk.gray, chalk.bgGray],
  error: [chalk.red, chalk.bgRed],
  warn: [chalk.yellow, chalk.bgYellow],
  fatal: [chalk.redBright, chalk.bgRedBright],
} as const;

/**
 * A logger suitable for using in unit tests.
 * - It uses chalk for colors (Node and browser console.log supports)
 * - Does not rely on async behavior of `pino`.
 */
export class TestLogger extends BaseLogger implements Logger {
  constructor(
    bindings: Record<string, any> = {},
    options: { level?: string; msgPrefix?: string } = {},
  ) {
    super(
      bindings,
      { ...options, level: options.level ?? "error" },
      TestLogger,
    );
  }

  protected createLogMethod(
    name: "trace" | "debug" | "info" | "warn" | "error" | "fatal",
    bindings: Record<string, any>,
  ): Logger.LogFn {
    const msgs: string[] = [colors[name][1](name)];

    if (this.options?.msgPrefix) {
      msgs.push(colors[name][0](this.options.msgPrefix));
    }

    if (typeof bindings === "object" && "methodName" in bindings) {
      msgs.push(chalk.magenta(`.${bindings.methodName}()`));
    }

    // eslint-disable-next-line no-console
    return vi.fn<Logger.LogFn>(console[name === "fatal" ? "error" : name].bind(
      console,
      msgs.join(" "),
    )) as Logger.LogFn;
  }
}
