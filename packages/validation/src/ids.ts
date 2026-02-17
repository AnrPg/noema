/**
 * @noema/validation - Branded ID Schemas
 *
 * Zod schemas for validating all branded ID types.
 * These ensure IDs have correct format at runtime.
 */

import { z } from 'zod';
import { ID_PREFIXES } from '@noema/types';

// ============================================================================
// Base ID Schema Factory
// ============================================================================

/**
 * Create a Zod schema for a branded ID with a specific prefix.
 */
function createIdSchema(prefix: string, description: string) {
  const pattern = new RegExp(`^${prefix}[a-zA-Z0-9]{21}$`);
  return z
    .string()
    .regex(pattern, `Invalid ${description} format. Expected ${prefix}<21-char-nanoid>`)
    .describe(description);
}

// ============================================================================
// Individual ID Schemas
// ============================================================================

export const UserIdSchema = createIdSchema(ID_PREFIXES.UserId, 'User ID');
export const CardIdSchema = createIdSchema(ID_PREFIXES.CardId, 'Card ID');
export const DeckIdSchema = createIdSchema(ID_PREFIXES.DeckId, 'Deck ID');
export const CategoryIdSchema = createIdSchema(ID_PREFIXES.CategoryId, 'Category ID');
export const SessionIdSchema = createIdSchema(ID_PREFIXES.SessionId, 'Session ID');
export const AttemptIdSchema = createIdSchema(ID_PREFIXES.AttemptId, 'Attempt ID');
export const TraceIdSchema = createIdSchema(ID_PREFIXES.TraceId, 'Trace ID');
export const DiagnosisIdSchema = createIdSchema(ID_PREFIXES.DiagnosisId, 'Diagnosis ID');
export const PatchIdSchema = createIdSchema(ID_PREFIXES.PatchId, 'Patch ID');
export const LoadoutIdSchema = createIdSchema(ID_PREFIXES.LoadoutId, 'Loadout ID');
export const NodeIdSchema = createIdSchema(ID_PREFIXES.NodeId, 'Node ID');
export const EdgeIdSchema = createIdSchema(ID_PREFIXES.EdgeId, 'Edge ID');
export const AchievementIdSchema = createIdSchema(ID_PREFIXES.AchievementId, 'Achievement ID');
export const StreakIdSchema = createIdSchema(ID_PREFIXES.StreakId, 'Streak ID');
export const JobIdSchema = createIdSchema(ID_PREFIXES.JobId, 'Job ID');
export const EventIdSchema = createIdSchema(ID_PREFIXES.EventId, 'Event ID');
export const CorrelationIdSchema = createIdSchema(ID_PREFIXES.CorrelationId, 'Correlation ID');
export const CausationIdSchema = createIdSchema(ID_PREFIXES.CausationId, 'Causation ID');
export const ToolIdSchema = createIdSchema(ID_PREFIXES.ToolId, 'Tool ID');
export const AgentIdSchema = createIdSchema(ID_PREFIXES.AgentId, 'Agent ID');
export const MediaIdSchema = createIdSchema(ID_PREFIXES.MediaId, 'Media ID');
export const NotificationIdSchema = createIdSchema(ID_PREFIXES.NotificationId, 'Notification ID');
export const RoomIdSchema = createIdSchema(ID_PREFIXES.RoomId, 'Room ID');

// ============================================================================
// ID Schema Registry
// ============================================================================

/**
 * All ID schemas indexed by prefix.
 */
export const IdSchemas = {
  [ID_PREFIXES.UserId]: UserIdSchema,
  [ID_PREFIXES.CardId]: CardIdSchema,
  [ID_PREFIXES.DeckId]: DeckIdSchema,
  [ID_PREFIXES.CategoryId]: CategoryIdSchema,
  [ID_PREFIXES.SessionId]: SessionIdSchema,
  [ID_PREFIXES.AttemptId]: AttemptIdSchema,
  [ID_PREFIXES.TraceId]: TraceIdSchema,
  [ID_PREFIXES.DiagnosisId]: DiagnosisIdSchema,
  [ID_PREFIXES.PatchId]: PatchIdSchema,
  [ID_PREFIXES.LoadoutId]: LoadoutIdSchema,
  [ID_PREFIXES.NodeId]: NodeIdSchema,
  [ID_PREFIXES.EdgeId]: EdgeIdSchema,
  [ID_PREFIXES.AchievementId]: AchievementIdSchema,
  [ID_PREFIXES.StreakId]: StreakIdSchema,
  [ID_PREFIXES.JobId]: JobIdSchema,
  [ID_PREFIXES.EventId]: EventIdSchema,
  [ID_PREFIXES.CorrelationId]: CorrelationIdSchema,
  [ID_PREFIXES.CausationId]: CausationIdSchema,
  [ID_PREFIXES.ToolId]: ToolIdSchema,
  [ID_PREFIXES.AgentId]: AgentIdSchema,
  [ID_PREFIXES.MediaId]: MediaIdSchema,
  [ID_PREFIXES.NotificationId]: NotificationIdSchema,
  [ID_PREFIXES.RoomId]: RoomIdSchema,
} as const;

// ============================================================================
// Type Inference
// ============================================================================

export type UserIdInput = z.input<typeof UserIdSchema>;
export type CardIdInput = z.input<typeof CardIdSchema>;
export type DeckIdInput = z.input<typeof DeckIdSchema>;
export type CategoryIdInput = z.input<typeof CategoryIdSchema>;
export type SessionIdInput = z.input<typeof SessionIdSchema>;
export type AttemptIdInput = z.input<typeof AttemptIdSchema>;
export type TraceIdInput = z.input<typeof TraceIdSchema>;
export type DiagnosisIdInput = z.input<typeof DiagnosisIdSchema>;
export type PatchIdInput = z.input<typeof PatchIdSchema>;
export type LoadoutIdInput = z.input<typeof LoadoutIdSchema>;
export type NodeIdInput = z.input<typeof NodeIdSchema>;
export type EdgeIdInput = z.input<typeof EdgeIdSchema>;
export type AchievementIdInput = z.input<typeof AchievementIdSchema>;
export type StreakIdInput = z.input<typeof StreakIdSchema>;
export type JobIdInput = z.input<typeof JobIdSchema>;
export type EventIdInput = z.input<typeof EventIdSchema>;
export type CorrelationIdInput = z.input<typeof CorrelationIdSchema>;
export type CausationIdInput = z.input<typeof CausationIdSchema>;
export type ToolIdInput = z.input<typeof ToolIdSchema>;
export type AgentIdInput = z.input<typeof AgentIdSchema>;
export type MediaIdInput = z.input<typeof MediaIdSchema>;
export type NotificationIdInput = z.input<typeof NotificationIdSchema>;
export type RoomIdInput = z.input<typeof RoomIdSchema>;
