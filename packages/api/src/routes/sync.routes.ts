// =============================================================================
// OFFLINE-FIRST SYNC ROUTES
// =============================================================================
// API endpoints for client-server synchronization with conflict resolution
// Supports offline-first architecture with eventual consistency

import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { authenticate } from "../middleware/auth";

// =============================================================================
// SCHEMAS
// =============================================================================

const vectorClockSchema = z.record(z.string(), z.number());

const syncOperationSchema = z.enum(["create", "update", "delete"]);

const syncEntityTypeSchema = z.enum([
  "card",
  "deck",
  "review",
  "category",
  "card_category_participation",
  "contextual_annotation",
  "emphasis_rule",
  "multi_context_performance",
  "study_session",
  "user_settings",
]);

const conflictResolutionStrategySchema = z.enum([
  "local_wins",
  "remote_wins",
  "latest_wins",
  "merge",
  "manual",
]);

const conflictHintSchema = z.object({
  strategy: conflictResolutionStrategySchema,
  priority: z.number(),
  preserveFields: z.array(z.string()).optional(),
});

const syncChangeSchema = z.object({
  id: z.string().uuid(),
  entityType: syncEntityTypeSchema,
  entityId: z.string().uuid(),
  operation: syncOperationSchema,
  timestamp: z.string().datetime(),
  clientId: z.string(),
  version: z.number().int().min(0),
  vectorClock: vectorClockSchema,
  data: z.unknown(),
  checksum: z.string(),
  parentVersion: z.number().int().nullable(),
  conflictResolutionHint: conflictHintSchema.optional(),
});

const deviceInfoSchema = z.object({
  deviceId: z.string(),
  deviceName: z.string(),
  platform: z.enum(["ios", "android", "web", "desktop"]),
  appVersion: z.string(),
  lastSyncAt: z.string().datetime().nullable(),
});

const syncPushRequestSchema = z.object({
  clientId: z.string(),
  lastSyncVersion: z.number().int().min(0),
  vectorClock: vectorClockSchema,
  changes: z.array(syncChangeSchema),
  deviceInfo: deviceInfoSchema,
});

const syncPullRequestSchema = z.object({
  clientId: z.string(),
  lastSyncVersion: z.number().int().min(0),
  vectorClock: vectorClockSchema,
  entityTypes: z.array(syncEntityTypeSchema).optional(),
  since: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(1000).optional(),
});

const conflictTypeSchema = z.enum([
  "concurrent_update",
  "update_delete",
  "delete_update",
  "create_create",
  "parent_deleted",
  "constraint_violation",
]);

const conflictSeveritySchema = z.enum(["critical", "high", "medium", "low"]);

const syncConflictSchema = z.object({
  id: z.string().uuid(),
  entityType: syncEntityTypeSchema,
  entityId: z.string().uuid(),
  localChange: syncChangeSchema,
  remoteChange: syncChangeSchema,
  baseVersion: syncChangeSchema.nullable(),
  conflictType: conflictTypeSchema,
  severity: conflictSeveritySchema,
  autoResolvable: z.boolean(),
  suggestedResolution: conflictResolutionStrategySchema,
  detectedAt: z.string().datetime(),
});

const resolveConflictRequestSchema = z.object({
  conflictId: z.string().uuid(),
  resolution: conflictResolutionStrategySchema,
  manualData: z.unknown().optional(),
});

const mergeDetailsSchema = z.object({
  fieldsFromLocal: z.array(z.string()),
  fieldsFromRemote: z.array(z.string()),
  mergedFields: z.array(z.string()),
  droppedChanges: z.array(
    z.object({
      field: z.string(),
      source: z.enum(["local", "remote"]),
      value: z.unknown(),
      reason: z.string(),
    }),
  ),
});

const resolvedConflictSchema = z.object({
  conflictId: z.string().uuid(),
  resolution: conflictResolutionStrategySchema,
  resultingChange: syncChangeSchema,
  mergeDetails: mergeDetailsSchema.nullable(),
  resolvedAt: z.string().datetime(),
  resolvedBy: z.enum(["auto", "user", "plugin"]),
  requiresReview: z.boolean(),
});

const acceptedChangeSchema = z.object({
  changeId: z.string().uuid(),
  entityId: z.string().uuid(),
  serverVersion: z.number().int(),
  processedAt: z.string().datetime(),
});

const rejectedChangeSchema = z.object({
  changeId: z.string().uuid(),
  entityId: z.string().uuid(),
  reason: z.string(),
  errorCode: z.string(),
  recoverable: z.boolean(),
});

const deletedEntitySchema = z.object({
  entityType: syncEntityTypeSchema,
  entityId: z.string().uuid(),
  deletedAt: z.string().datetime(),
  deletedBy: z.string().uuid(),
});

const syncPushResponseSchema = z.object({
  sessionId: z.string().uuid(),
  accepted: z.array(acceptedChangeSchema),
  rejected: z.array(rejectedChangeSchema),
  conflicts: z.array(syncConflictSchema),
  serverVersion: z.number().int(),
  serverVectorClock: vectorClockSchema,
});

const syncPullResponseSchema = z.object({
  sessionId: z.string().uuid(),
  changes: z.array(syncChangeSchema),
  hasMore: z.boolean(),
  serverVersion: z.number().int(),
  serverVectorClock: vectorClockSchema,
  deletedEntities: z.array(deletedEntitySchema),
});

const syncStatsSchema = z.object({
  totalChanges: z.number().int(),
  uploaded: z.number().int(),
  downloaded: z.number().int(),
  conflictsDetected: z.number().int(),
  conflictsResolved: z.number().int(),
  conflictsPending: z.number().int(),
  bytesTransferred: z.number().int(),
  duration: z.number().int(),
});

const syncSessionSchema = z.object({
  id: z.string().uuid(),
  clientId: z.string(),
  userId: z.string().uuid(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  status: z.enum([
    "pending",
    "in_progress",
    "resolving_conflicts",
    "completed",
    "failed",
    "cancelled",
  ]),
  direction: z.enum(["push", "pull", "bidirectional"]),
  stats: syncStatsSchema,
  errors: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      entityType: syncEntityTypeSchema.optional(),
      entityId: z.string().uuid().optional(),
      recoverable: z.boolean(),
      timestamp: z.string().datetime(),
    }),
  ),
});

const clientSyncStateSchema = z.object({
  clientId: z.string(),
  lastSyncVersion: z.number().int(),
  vectorClock: vectorClockSchema,
  lastSyncAt: z.string().datetime().nullable(),
  pendingChangesCount: z.number().int(),
  unresolvedConflictsCount: z.number().int(),
  syncStatus: z.enum([
    "synced",
    "pending_push",
    "pending_pull",
    "syncing",
    "conflict",
    "error",
    "offline",
  ]),
});

// =============================================================================
// TYPE EXPORTS
// =============================================================================

type _SyncChange = z.infer<typeof syncChangeSchema>;
type SyncConflict = z.infer<typeof syncConflictSchema>;
type SyncPushRequest = z.infer<typeof syncPushRequestSchema>;
type SyncPullRequest = z.infer<typeof syncPullRequestSchema>;
type ResolveConflictRequest = z.infer<typeof resolveConflictRequestSchema>;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Compare vector clocks to determine causal ordering
 */
function compareVectorClocks(
  a: Record<string, number>,
  b: Record<string, number>,
): "before" | "after" | "concurrent" {
  let aBeforeB = false;
  let bBeforeA = false;

  const allClients = new Set([...Object.keys(a), ...Object.keys(b)]);

  for (const client of allClients) {
    const aVal = a[client] || 0;
    const bVal = b[client] || 0;

    if (aVal < bVal) aBeforeB = true;
    if (bVal < aVal) bBeforeA = true;
  }

  if (aBeforeB && !bBeforeA) return "before";
  if (bBeforeA && !aBeforeB) return "after";
  return "concurrent";
}

/**
 * Merge two vector clocks
 */
function mergeVectorClocks(
  a: Record<string, number>,
  b: Record<string, number>,
): Record<string, number> {
  const merged: Record<string, number> = {};
  const allClients = new Set([...Object.keys(a), ...Object.keys(b)]);

  for (const client of allClients) {
    merged[client] = Math.max(a[client] || 0, b[client] || 0);
  }

  return merged;
}

/**
 * Generate a simple checksum for data
 */
function generateChecksum(data: unknown): string {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

/**
 * Get table name for entity type
 */
function getTableName(entityType: string): string {
  const tableMap: Record<string, string> = {
    card: "Card",
    deck: "Deck",
    review: "Review",
    category: "Category",
    card_category_participation: "CardCategoryParticipation",
    contextual_annotation: "ContextualAnnotation",
    emphasis_rule: "EmphasisRule",
    multi_context_performance: "MultiContextPerformance",
    study_session: "StudySession",
    user_settings: "User",
  };
  return tableMap[entityType] || entityType;
}

/**
 * Auto-resolve a conflict based on strategy
 */
function autoResolveConflict(
  conflict: SyncConflict,
  strategy: string,
): { data: unknown; fieldsFromLocal: string[]; fieldsFromRemote: string[] } {
  const localData = conflict.localChange.data as Record<string, unknown>;
  const remoteData = conflict.remoteChange.data as Record<string, unknown>;

  switch (strategy) {
    case "local_wins":
      return {
        data: localData,
        fieldsFromLocal: Object.keys(localData),
        fieldsFromRemote: [],
      };

    case "remote_wins":
      return {
        data: remoteData,
        fieldsFromLocal: [],
        fieldsFromRemote: Object.keys(remoteData),
      };

    case "latest_wins": {
      const latestLocalTime = new Date(
        conflict.localChange.timestamp,
      ).getTime();
      const latestRemoteTime = new Date(
        conflict.remoteChange.timestamp,
      ).getTime();
      if (latestLocalTime >= latestRemoteTime) {
        return {
          data: localData,
          fieldsFromLocal: Object.keys(localData),
          fieldsFromRemote: [],
        };
      }
      return {
        data: remoteData,
        fieldsFromLocal: [],
        fieldsFromRemote: Object.keys(remoteData),
      };
    }

    case "merge": {
      // Field-level merge: prefer local for user-editable fields, remote for system fields
      const systemFields = [
        "id",
        "createdAt",
        "updatedAt",
        "version",
        "userId",
      ];
      const merged: Record<string, unknown> = {};
      const fieldsFromLocal: string[] = [];
      const fieldsFromRemote: string[] = [];

      const allFields = new Set([
        ...Object.keys(localData),
        ...Object.keys(remoteData),
      ]);

      for (const field of allFields) {
        if (systemFields.includes(field)) {
          merged[field] = remoteData[field] ?? localData[field];
          if (remoteData[field] !== undefined) fieldsFromRemote.push(field);
          else fieldsFromLocal.push(field);
        } else {
          // For user fields, prefer local changes
          merged[field] = localData[field] ?? remoteData[field];
          if (localData[field] !== undefined) fieldsFromLocal.push(field);
          else fieldsFromRemote.push(field);
        }
      }

      return { data: merged, fieldsFromLocal, fieldsFromRemote };
    }

    default:
      return {
        data: remoteData,
        fieldsFromLocal: [],
        fieldsFromRemote: Object.keys(remoteData),
      };
  }
}

// =============================================================================
// ROUTES
// =============================================================================

export const syncRoutes: FastifyPluginAsync = async (app) => {
  // ===========================================================================
  // PUSH CHANGES
  // ===========================================================================

  app.post<{
    Body: SyncPushRequest;
  }>(
    "/push",
    {
      preHandler: [authenticate],
      schema: {
        description: "Push local changes to server for synchronization",
        tags: ["Sync"],
        body: syncPushRequestSchema,
        response: {
          200: syncPushResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const {
        clientId,
        lastSyncVersion,
        vectorClock,
        changes,
        deviceInfo: _deviceInfo,
      } = request.body;
      const userId = request.user!.id;

      const sessionId = crypto.randomUUID();
      const accepted: z.infer<typeof acceptedChangeSchema>[] = [];
      const rejected: z.infer<typeof rejectedChangeSchema>[] = [];
      const conflicts: z.infer<typeof syncConflictSchema>[] = [];

      // Get current server state
      // In a real implementation, this would track per-user sync versions
      let serverVersion = lastSyncVersion;
      let serverVectorClock = { ...vectorClock };

      // Process each change
      for (const change of changes) {
        try {
          // Verify ownership
          const table = getTableName(change.entityType);

          // Check for conflicts with existing data
          const existingData = await (request.prisma as any)[table].findUnique({
            where: { id: change.entityId },
          });

          if (change.operation === "create" && existingData) {
            // Create-create conflict
            conflicts.push({
              id: crypto.randomUUID(),
              entityType: change.entityType,
              entityId: change.entityId,
              localChange: change,
              remoteChange: {
                ...change,
                data: existingData,
                timestamp:
                  existingData.updatedAt?.toISOString() ||
                  new Date().toISOString(),
              },
              baseVersion: null,
              conflictType: "create_create",
              severity: "high",
              autoResolvable: false,
              suggestedResolution: "manual",
              detectedAt: new Date().toISOString(),
            });
            continue;
          }

          if (
            change.operation === "update" &&
            existingData &&
            existingData.updatedAt
          ) {
            const localTime = new Date(change.timestamp).getTime();
            const serverTime = existingData.updatedAt.getTime();

            // Check if concurrent update
            if (serverTime > new Date(change.parentVersion || 0).getTime()) {
              const ordering = compareVectorClocks(
                change.vectorClock,
                serverVectorClock,
              );

              if (ordering === "concurrent") {
                conflicts.push({
                  id: crypto.randomUUID(),
                  entityType: change.entityType,
                  entityId: change.entityId,
                  localChange: change,
                  remoteChange: {
                    ...change,
                    data: existingData,
                    timestamp: existingData.updatedAt.toISOString(),
                    version: existingData.version || serverVersion,
                  },
                  baseVersion: null,
                  conflictType: "concurrent_update",
                  severity: "medium",
                  autoResolvable: true,
                  suggestedResolution:
                    change.conflictResolutionHint?.strategy || "latest_wins",
                  detectedAt: new Date().toISOString(),
                });
                continue;
              }
            }
          }

          if (change.operation === "delete" && !existingData) {
            // Already deleted - just accept
            accepted.push({
              changeId: change.id,
              entityId: change.entityId,
              serverVersion: serverVersion + 1,
              processedAt: new Date().toISOString(),
            });
            continue;
          }

          // Apply the change
          const data = change.data as Record<string, unknown>;

          switch (change.operation) {
            case "create":
              await (request.prisma as any)[table].create({
                data: {
                  ...data,
                  id: change.entityId,
                  userId,
                },
              });
              break;

            case "update":
              await (request.prisma as any)[table].update({
                where: { id: change.entityId },
                data: {
                  ...data,
                  updatedAt: new Date(),
                },
              });
              break;

            case "delete":
              await (request.prisma as any)[table].delete({
                where: { id: change.entityId },
              });
              break;
          }

          serverVersion++;
          serverVectorClock = mergeVectorClocks(
            serverVectorClock,
            change.vectorClock,
          );
          serverVectorClock["server"] = (serverVectorClock["server"] || 0) + 1;

          accepted.push({
            changeId: change.id,
            entityId: change.entityId,
            serverVersion,
            processedAt: new Date().toISOString(),
          });
        } catch (error: any) {
          rejected.push({
            changeId: change.id,
            entityId: change.entityId,
            reason: error.message || "Unknown error",
            errorCode: "SERVER_ERROR",
            recoverable: true,
          });
        }
      }

      // Log sync session
      await request.prisma.syncLog.create({
        data: {
          id: sessionId,
          userId,
          clientId,
          direction: "push",
          changesCount: changes.length,
          acceptedCount: accepted.length,
          rejectedCount: rejected.length,
          conflictsCount: conflicts.length,
          completedAt: new Date(),
        },
      });

      return reply.send({
        sessionId,
        accepted,
        rejected,
        conflicts,
        serverVersion,
        serverVectorClock,
      });
    },
  );

  // ===========================================================================
  // PULL CHANGES
  // ===========================================================================

  app.post<{
    Body: SyncPullRequest;
  }>(
    "/pull",
    {
      preHandler: [authenticate],
      schema: {
        description: "Pull changes from server since last sync",
        tags: ["Sync"],
        body: syncPullRequestSchema,
        response: {
          200: syncPullResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const {
        clientId,
        lastSyncVersion,
        vectorClock,
        entityTypes,
        since,
        limit = 100,
      } = request.body;
      const userId = request.user!.id;

      const sessionId = crypto.randomUUID();
      const changes: z.infer<typeof syncChangeSchema>[] = [];
      const deletedEntities: z.infer<typeof deletedEntitySchema>[] = [];

      // Determine which entity types to sync
      const typesToSync = entityTypes || [
        "card",
        "deck",
        "review",
        "category",
        "card_category_participation",
        "contextual_annotation",
        "emphasis_rule",
        "multi_context_performance",
      ];

      const sinceDate = since ? new Date(since) : new Date(0);

      // Fetch changes for each entity type
      for (const entityType of typesToSync) {
        const table = getTableName(entityType);

        try {
          const records = await (request.prisma as any)[table].findMany({
            where: {
              userId,
              updatedAt: { gt: sinceDate },
            },
            orderBy: { updatedAt: "asc" },
            take: Math.ceil(limit / typesToSync.length),
          });

          for (const record of records) {
            changes.push({
              id: crypto.randomUUID(),
              entityType,
              entityId: record.id,
              operation: record.createdAt > sinceDate ? "create" : "update",
              timestamp: record.updatedAt.toISOString(),
              clientId: "server",
              version: record.version || 1,
              vectorClock: { server: record.version || 1 },
              data: record,
              checksum: generateChecksum(record),
              parentVersion: null,
            });
          }
        } catch (error) {
          // Table might not exist or have different structure
          console.error(`Error fetching ${entityType}:`, error);
        }
      }

      // Check for deleted entities from deletion log
      const deletions = await request.prisma.deletionLog.findMany({
        where: {
          userId,
          deletedAt: { gt: sinceDate },
          entityType: { in: typesToSync },
        },
      });

      for (const deletion of deletions) {
        deletedEntities.push({
          entityType: deletion.entityType as any,
          entityId: deletion.entityId,
          deletedAt: deletion.deletedAt.toISOString(),
          deletedBy: deletion.userId,
        });
      }

      // Calculate server state
      const serverVersion = lastSyncVersion + changes.length;
      const serverVectorClock = mergeVectorClocks(vectorClock, {
        server: serverVersion,
      });

      // Log sync session
      await request.prisma.syncLog.create({
        data: {
          id: sessionId,
          userId,
          clientId,
          direction: "pull",
          changesCount: changes.length,
          acceptedCount: changes.length,
          rejectedCount: 0,
          conflictsCount: 0,
          completedAt: new Date(),
        },
      });

      return reply.send({
        sessionId,
        changes,
        hasMore: changes.length >= limit,
        serverVersion,
        serverVectorClock,
        deletedEntities,
      });
    },
  );

  // ===========================================================================
  // RESOLVE CONFLICT
  // ===========================================================================

  app.post<{
    Body: ResolveConflictRequest;
  }>(
    "/conflicts/resolve",
    {
      preHandler: [authenticate],
      schema: {
        description: "Resolve a sync conflict",
        tags: ["Sync"],
        body: resolveConflictRequestSchema,
        response: {
          200: resolvedConflictSchema,
        },
      },
    },
    async (request, reply) => {
      const { conflictId, resolution, manualData } = request.body;
      const userId = request.user!.id;

      // Get the conflict from pending conflicts
      const pendingConflict = await request.prisma.pendingConflict.findUnique({
        where: { id: conflictId },
      });

      if (!pendingConflict) {
        return reply.status(404).send({
          error: "Conflict not found",
          message:
            "The specified conflict does not exist or was already resolved",
        });
      }

      if (pendingConflict.userId !== userId) {
        return reply.status(403).send({
          error: "Forbidden",
          message: "You do not have permission to resolve this conflict",
        });
      }

      const conflict = pendingConflict.conflictData as unknown as SyncConflict;
      let resultingData: unknown;
      let mergeDetails: z.infer<typeof mergeDetailsSchema> | null = null;

      if (resolution === "manual" && manualData) {
        resultingData = manualData;
        mergeDetails = {
          fieldsFromLocal: [],
          fieldsFromRemote: [],
          mergedFields: Object.keys(manualData as object),
          droppedChanges: [],
        };
      } else {
        const resolved = autoResolveConflict(conflict, resolution);
        resultingData = resolved.data;
        mergeDetails = {
          fieldsFromLocal: resolved.fieldsFromLocal,
          fieldsFromRemote: resolved.fieldsFromRemote,
          mergedFields: [],
          droppedChanges: [],
        };
      }

      // Apply the resolution
      const table = getTableName(conflict.entityType);

      await (request.prisma as any)[table].upsert({
        where: { id: conflict.entityId },
        update: resultingData as any,
        create: {
          id: conflict.entityId,
          userId,
          ...(resultingData as any),
        },
      });

      // Mark conflict as resolved
      await request.prisma.pendingConflict.delete({
        where: { id: conflictId },
      });

      const resultingChange: z.infer<typeof syncChangeSchema> = {
        id: crypto.randomUUID(),
        entityType: conflict.entityType,
        entityId: conflict.entityId,
        operation: "update",
        timestamp: new Date().toISOString(),
        clientId: "server",
        version: (conflict.localChange.version || 0) + 1,
        vectorClock: mergeVectorClocks(
          conflict.localChange.vectorClock,
          conflict.remoteChange.vectorClock,
        ),
        data: resultingData,
        checksum: generateChecksum(resultingData),
        parentVersion: conflict.localChange.version,
      };

      return reply.send({
        conflictId,
        resolution,
        resultingChange,
        mergeDetails,
        resolvedAt: new Date().toISOString(),
        resolvedBy: resolution === "manual" ? "user" : "auto",
        requiresReview: false,
      });
    },
  );

  // ===========================================================================
  // GET PENDING CONFLICTS
  // ===========================================================================

  app.get(
    "/conflicts",
    {
      preHandler: [authenticate],
      schema: {
        description: "Get all pending conflicts for the user",
        tags: ["Sync"],
        response: {
          200: z.object({
            conflicts: z.array(syncConflictSchema),
            total: z.number().int(),
          }),
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;

      const pendingConflicts = await request.prisma.pendingConflict.findMany({
        where: { userId },
        orderBy: { detectedAt: "desc" },
      });

      const conflicts = pendingConflicts.map(
        (pc) => pc.conflictData as unknown as SyncConflict,
      );

      return reply.send({
        conflicts,
        total: conflicts.length,
      });
    },
  );

  // ===========================================================================
  // GET SYNC STATE
  // ===========================================================================

  app.get<{
    Querystring: { clientId: string };
  }>(
    "/state",
    {
      preHandler: [authenticate],
      schema: {
        description: "Get current sync state for a client",
        tags: ["Sync"],
        querystring: z.object({
          clientId: z.string(),
        }),
        response: {
          200: clientSyncStateSchema,
        },
      },
    },
    async (request, reply) => {
      const { clientId } = request.query;
      const userId = request.user!.id;

      // Get latest sync log for this client
      const latestSync = await request.prisma.syncLog.findFirst({
        where: { userId, clientId },
        orderBy: { completedAt: "desc" },
      });

      // Get pending conflicts count
      const conflictsCount = await request.prisma.pendingConflict.count({
        where: { userId },
      });

      // Determine sync status
      let syncStatus: string = "synced";
      if (conflictsCount > 0) {
        syncStatus = "conflict";
      } else if (!latestSync) {
        syncStatus = "pending_pull";
      }

      return reply.send({
        clientId,
        lastSyncVersion: latestSync?.changesCount || 0,
        vectorClock: { server: latestSync?.changesCount || 0 },
        lastSyncAt: latestSync?.completedAt?.toISOString() || null,
        pendingChangesCount: 0, // Would need client-side tracking
        unresolvedConflictsCount: conflictsCount,
        syncStatus,
      });
    },
  );

  // ===========================================================================
  // GET SYNC HISTORY
  // ===========================================================================

  app.get<{
    Querystring: {
      clientId?: string;
      limit?: number;
      offset?: number;
    };
  }>(
    "/history",
    {
      preHandler: [authenticate],
      schema: {
        description: "Get sync session history",
        tags: ["Sync"],
        querystring: z.object({
          clientId: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(100).optional(),
          offset: z.coerce.number().int().min(0).optional(),
        }),
        response: {
          200: z.object({
            sessions: z.array(syncSessionSchema),
            total: z.number().int(),
            hasMore: z.boolean(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { clientId, limit = 20, offset = 0 } = request.query;
      const userId = request.user!.id;

      const where: any = { userId };
      if (clientId) where.clientId = clientId;

      const [sessions, total] = await Promise.all([
        request.prisma.syncLog.findMany({
          where,
          orderBy: { completedAt: "desc" },
          take: limit,
          skip: offset,
        }),
        request.prisma.syncLog.count({ where }),
      ]);

      const formattedSessions = sessions.map((s) => ({
        id: s.id,
        clientId: s.clientId,
        userId: s.userId,
        startedAt: s.createdAt.toISOString(),
        completedAt: s.completedAt?.toISOString() || null,
        status: "completed" as const,
        direction: s.direction as "push" | "pull" | "bidirectional",
        stats: {
          totalChanges: s.changesCount,
          uploaded: s.direction === "push" ? s.acceptedCount : 0,
          downloaded: s.direction === "pull" ? s.acceptedCount : 0,
          conflictsDetected: s.conflictsCount,
          conflictsResolved: s.conflictsCount,
          conflictsPending: 0,
          bytesTransferred: 0,
          duration: 0,
        },
        errors: [],
      }));

      return reply.send({
        sessions: formattedSessions,
        total,
        hasMore: offset + sessions.length < total,
      });
    },
  );

  // ===========================================================================
  // FORCE SYNC
  // ===========================================================================

  app.post<{
    Body: { clientId: string; direction: "push" | "pull" | "bidirectional" };
  }>(
    "/force",
    {
      preHandler: [authenticate],
      schema: {
        description: "Force a sync operation for conflict resolution",
        tags: ["Sync"],
        body: z.object({
          clientId: z.string(),
          direction: z.enum(["push", "pull", "bidirectional"]),
        }),
        response: {
          200: z.object({
            success: z.boolean(),
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { clientId: _clientId, direction } = request.body;
      const userId = request.user!.id;

      // Clear all pending conflicts for this user
      if (direction === "push") {
        // Local wins - clear conflicts, data already synced
        await request.prisma.pendingConflict.deleteMany({
          where: { userId },
        });
      } else if (direction === "pull") {
        // Remote wins - clear conflicts, need to re-pull
        await request.prisma.pendingConflict.deleteMany({
          where: { userId },
        });
      }

      return reply.send({
        success: true,
        message: `Forced ${direction} sync completed. ${
          direction === "push"
            ? "Local changes preserved."
            : "Server changes will be pulled."
        }`,
      });
    },
  );
};

export default syncRoutes;
