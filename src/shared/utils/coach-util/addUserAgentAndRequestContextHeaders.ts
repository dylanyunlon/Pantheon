// @ts-nocheck
/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
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

import type { ObjectOrInterfaceDefinition } from "../coach-types";
import { USER_AGENT_HEADER } from "../coach-types";
import { createFetchHeaderMutator } from "../coach-types";
import type { MinimalClient } from "../MinimalClientContext";

export const addUserAgentAndRequestContextHeaders = (
  client: MinimalClient,
  withMetadata: Pick<ObjectOrInterfaceDefinition, "apiName" | "properties" | "type">,
): MinimalClient => ({
  ...client,
  fetch: createFetchHeaderMutator(
    client.fetch,
    (headers) => {
      headers.set(
        "X-COACH-Request-Context",
        JSON.stringify(client.requestContext),
      );

      if ((withMetadata as any).coachMetadata) {
        headers.set(
          USER_AGENT_HEADER,
          [
            headers.get(USER_AGENT_HEADER),
            (withMetadata as any).coachMetadata.extraUserAgent,
          ].filter(x => x && x?.length > 0).join(" "),
        );
      }
      return headers;
    },
  ),
});
