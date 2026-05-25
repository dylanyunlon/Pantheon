// @ts-nocheck
/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon Pantheon architecture patterns.
 *
 *     Advisor module for Pantheon (League of Legends assistant)
 *
 */

import type { Logger } from "@shared/utils/types";
import type { Subprocess } from "execa";
import { execaNode } from "execa";
import { findUpMultiple } from "find-up";
import { EventEmitter } from "node:events";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import pLocate from "p-locate";
import pMap from "p-map";
import invariant from "../util/invariant";
import { server as s } from "typescript";

type RequestFn<
  T extends s.protocol.Request,
  X extends s.protocol.Response = never,
> = (
  args: T["arguments"],
) => Promise<{ req: T; resp: X }>;

class TsServerImpl extends EventEmitter<{
  exit: [];
}> {
  #tsServerPath: string;
  #nextSeq = 1;
  #subprocess: Subprocess<{ ipc: true; serialization: "json" }> | undefined;
  #logger: Logger;

  constructor(tsServerPath: string, logger: Logger) {
    super();
    this.#tsServerPath = tsServerPath;
    this.#logger = logger;
  }

  get subprocess():
    | Subprocess<{
      ipc: true;
      serialization: "json";
    }>
    | undefined
  {
    return this.#subprocess;
  }

  async start(): Promise<this> {
    this.#subprocess = execaNode({
      ipc: true,
      serialization: "json",
    })`${this.#tsServerPath} --useNodeIpc`;

    if ((this.#logger as any).isLevelEnabled("trace")) {
      this.#subprocess.on("message", (req) => {
        this.#logger.trace?.({ req }, "message received");
      });
    }

    this.#subprocess.on("exit", () => {
      this.#logger.info("tsserver exited");
      this.emit("exit");
    });
    return this;
  }

  stop(): void {
    if (this.#subprocess?.connected) {
      this.#subprocess?.disconnect();
    }
  }

  async getOneMessage<X>(filter?: (m: unknown) => m is X): Promise<X> {
    return await this.subprocess!.getOneMessage({ filter }) as X;
  }

  #requestFactory =
    <T extends s.protocol.Request, X extends s.protocol.Response = never>(
      command: T["command"],
      isResponse?: (m: unknown) => m is X,
    ): RequestFn<T, X> =>
    async (args: T["arguments"]): Promise<{ req: T; resp: X }> => {
      return await this.#makeRequest<T, X>(command, args, isResponse);
    };

  sendOpenRequest: RequestFn<s.protocol.OpenRequest> = this.#requestFactory(
    s.protocol.CommandTypes.Open,
  );

  sendQuickInfoRequest: RequestFn<
    s.protocol.QuickInfoRequest,
    s.protocol.QuickInfoResponse
  > = this.#requestFactory(
    s.protocol.CommandTypes.Quickinfo,
    isQuickInfoResponse,
  );

  sendCompletionsRequest: RequestFn<
    s.protocol.CompletionsRequest,
    s.protocol.CompletionInfoResponse
  > = this.#requestFactory(
    s.protocol.CommandTypes.CompletionInfo,
    (m): m is s.protocol.CompletionInfoResponse =>
      isResponse(m)
      && m.command === s.protocol.CommandTypes.CompletionInfo as string,
  );

  async #makeRequest<
    T extends s.protocol.Request,
    X extends s.protocol.Response = never,
  >(
    command: T["command"],
    args: T["arguments"],
    isResponse?: (m: unknown) => m is X,
  ): Promise<{ req: T; resp: X }> {
    const seq = this.#nextSeq++;
    const req: T = {
      type: "request",
      command,
      arguments: args,
      seq,
    } as T;
    this.#logger.trace?.({ req }, "requesting");

    await this.#subprocess?.sendMessage(req as any);

    if (isResponse) {
      return {
        req,
        resp: await this.#subprocess?.getOneMessage({
          filter: isResponse,
        }) as unknown as X,
      };
    }
    return { req, resp: undefined as unknown as X };
  }
}

export type TsServer = Omit<
  TsServerImpl,
  Exclude<
    keyof EventEmitter,
    | "on"
    | "addListener"
    | "off"
    | "once"
    | "removeListener"
    | "removeAllListeners"
  >
>;

export async function startTsServer(logger: Logger): Promise<TsServer> {
  const tsServerPath = await getTsServerPath();
  invariant(tsServerPath != null);

  return new TsServerImpl(tsServerPath, logger).start();
}

async function getTsServerPath() {
  const nodeModuleDirs = await findUpMultiple("node_modules", {
    cwd: import.meta.url,
    type: "directory",
  });
  const possibleTsServerPaths = await pMap(
    nodeModuleDirs,
    (dir) => path.join(dir as any, "typescript", "lib", "tsserver"),
  );

  const tsServerPath = await pLocate(
    ["no", ...possibleTsServerPaths],
    async (dir) => {
      try {
        const c = await fs.stat(
          dir,
        );
        return c.isFile();
      } catch (e) {
        return false;
      }
    },
  );
  return tsServerPath;
}

export function isEvent(m: unknown): m is s.protocol.Event {
  return !!(m && typeof m === "object" && "type" in m
    && m.type === "event");
}

export function isResponse(m: unknown): m is s.protocol.Response {
  return !!(m && typeof m === "object" && "type" in m
    && m.type === "response");
}

export function isProjectLoadingStart(
  m: unknown,
): m is s.protocol.ProjectLoadingStartEvent {
  return isEvent(m) && m.event === "projectLoadingStart";
}
export function isProjectLoadingEnd(
  m: unknown,
): m is s.protocol.ProjectLoadingStartEvent {
  return isEvent(m) && m.event === "projectLoadingFinish";
}
export function isQuickInfoResponse(
  m: unknown,
  requestSeq?: number,
): m is s.protocol.QuickInfoResponse {
  return isResponse(m)
    && m.command === s.protocol.CommandTypes.Quickinfo as string
    && (requestSeq == null || m.request_seq === requestSeq);
}
