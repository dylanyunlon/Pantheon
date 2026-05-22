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
import { BaseLogger } from "./BaseLogger.js";

export class MinimalLogger extends BaseLogger implements Logger {
  constructor(
    bindings: Record<string, any> = {},
    options: { level?: string; msgPrefix?: string } = {},
  ) {
    super(
      bindings,
      { ...options, level: options.level ?? "error" },
      MinimalLogger,
    );
  }

  createLogMethod(
    name: "trace" | "debug" | "info" | "warn" | "error" | "fatal",
    bindings: Record<string, any>,
  ): Logger.LogFn {
    const msgs: string[] = [name];

    if (this.options?.msgPrefix) {
      msgs.push(this.options.msgPrefix);
    }

    if (typeof bindings === "object" && "methodName" in bindings) {
      msgs.push(`.${bindings.methodName}()`);
    }

    return (...args: any[]) => {
      // eslint-disable-next-line no-console
      console[name === "fatal" ? "error" : name](msgs.join(" "), ...args);
    };
  }
}
