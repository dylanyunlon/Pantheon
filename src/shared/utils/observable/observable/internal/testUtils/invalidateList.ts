// @ts-nocheck
/*
 * Copyright 2025 dylanyunlon <dylanyunlong@gmail.com>. Advisor infrastructure.
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

import type { ObjectTypeDefinition, WhereClause } from "../../../../types";
import type { OrderBy } from "../../ObservableClient";
import type { Canonical } from "../Canonical";
import type { ListCacheKey } from "../list/ListCacheKey";
import type { SimpleWhereClause } from "../SimpleWhereClause";
import type { Store } from "../Store";

export async function invalidateList<T extends ObjectTypeDefinition>(
  store: Store,
  args: {
    type: Pick<T, "apiName" | "type">;
    where?: WhereClause<T> | SimpleWhereClause;
    orderBy?: OrderBy<T>;
  },
): Promise<void> {
  const where = store.whereCanonicalizer.canonicalize(args.where ?? {});
  const orderBy = store.orderByCanonicalizer.canonicalize(args.orderBy ?? {});

  const cacheKey = store.cacheKeys.get<ListCacheKey>(
    "list",
    args.type.type,
    args.type.apiName,
    where,
    orderBy as Canonical<OrderBy<T>>,
    undefined, // rdpConfig
    undefined, // intersectWith
    undefined, // pivotInfo
  );

  await store.queries.peek(cacheKey)?.revalidate(true);
}
