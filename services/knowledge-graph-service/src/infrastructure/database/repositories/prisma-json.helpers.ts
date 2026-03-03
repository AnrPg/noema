/**
 * @noema/knowledge-graph-service — Prisma JSONB bridging helpers
 *
 * Centralises the `as unknown as Prisma.JsonObject` casts that are
 * inevitable when bridging typed domain objects to/from Prisma's
 * loosely-typed JsonValue/JsonObject columns.
 *
 * Using a single helper per direction:
 * - Makes the cast greppable
 * - Provides a single point to add runtime validation later
 * - Removes the double-cast (`as unknown as`) from call sites
 */

import type { Prisma } from '../../../../generated/prisma/index.js';

/**
 * Cast a typed domain object to Prisma.JsonObject for INSERT/UPDATE.
 *
 * The generic preserves the call-site's domain type so that the
 * conversion intent is visible in diffs and IDE hover info.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- REASON: T carries the call-site domain type for readability and future runtime validation.
export function toPrismaJson<T>(value: T): Prisma.JsonObject {
  return value as unknown as Prisma.JsonObject;
}

/**
 * Cast a typed domain object to Prisma.JsonArray for INSERT/UPDATE.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- REASON: T carries the call-site domain type for readability and future runtime validation.
export function toPrismaJsonArray<T>(value: T): Prisma.JsonArray {
  return value as unknown as Prisma.JsonArray;
}

/**
 * Cast a Prisma.JsonValue back to a typed domain object for SELECT.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- REASON: T is the return type inferred at the call site; removing it forces manual 'as T' at every consumer.
export function fromPrismaJson<T>(value: Prisma.JsonValue): T {
  return value as unknown as T;
}
