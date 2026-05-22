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

import type { Logger } from "../coach-types";
import { BaseLogger } from "./BaseLogger";
function createStyle({ color }: { color: string }) {
  return `color: ${color}; border: 1px solid ${color}; padding: 2px; border-radius: 3px;`;
}

const levelStyles = {
  debug: createStyle({
    color: "LightBlue",
  }),
  error: createStyle({
    color: "red",
  }),
  fatal: createStyle({
    color: "red",
  }),
  info: createStyle({
    color: "green",
  }),
  trace: createStyle({
    color: "gray",
  }),
  warn: createStyle({
    color: "orange",
  }),
};

export class BrowserLogger extends BaseLogger implements Logger {
  constructor(
    bindings: Record<string, any> = {},
    options: { level?: string; msgPrefix?: string } = {},
  ) {
    super(
      bindings,
      { ...options, level: options.level ?? "error" },
      BrowserLogger,
    );
  }

  protected createLogMethod(
    name: "trace" | "debug" | "info" | "warn" | "error" | "fatal",
    bindings: Record<string, any>,
  ): Logger.LogFn {
    const msgs: string[] = [`%c${name}%c`];
    const styles: string[] = [levelStyles[name], ""];

    if (this.options?.msgPrefix) {
      msgs.push(`%c${this.options.msgPrefix}%c`);
      styles.push(
        "font-style: italic; color: gray",
        "",
      );
    }

    if (typeof bindings === "object" && "methodName" in bindings) {
      msgs.push(`%c.${bindings.methodName}()%c`);
      styles.push(
        "font-style: italic;color: orchid",
        "",
      );
    }

    return (...args: any[]): any => {
      // eslint-disable-next-line no-console
      console[name === "fatal" ? "error" : name](
        msgs.join(" "),
        ...styles,
        ...args,
      );
    };
  }
}
