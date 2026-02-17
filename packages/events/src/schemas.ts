/**
 * @noema/events - Event Schemas
 *
 * Zod schemas for runtime validation of events.
 */

import { z } from 'zod';
import {
  EnvironmentSchema,
  CorrelationIdSchema,
  CausationIdSchema,
  UserIdSchema,
  SessionIdSchema,
  AgentIdSchema,
  EventIdSchema,
  IsoDateTimeSchema,
  MetadataSchema,
} from '@noema/validation';

// ============================================================================
// Event Metadata Schema
// ============================================================================

/**
 * Schema for event metadata.
 */
export const EventMetadataSchema = z.object({
  serviceName: z.string().min(1).describe('Service that published the event'),
  serviceVersion: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, 'Invalid semver format')
    .describe('Semantic version of the service'),
  environment: EnvironmentSchema,
  userId: UserIdSchema.nullable().optional(),
  sessionId: SessionIdSchema.nullable().optional(),
  correlationId: CorrelationIdSchema,
  causationId: CausationIdSchema.nullable().optional(),
  agentId: AgentIdSchema.nullable().optional(),
  clientIp: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
  additional: MetadataSchema.optional(),
});

// ============================================================================
// Event Type Schema
// ============================================================================

/**
 * Event type format: {aggregate}.{action} or {aggregate}.{subresource}.{action}
 */
export const EventTypeSchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*){1,2}$/,
    'Event type must be lowercase with 2-3 dot-separated parts (e.g., "card.created")'
  )
  .describe('Event type in format aggregate.action');

/**
 * Aggregate type format: PascalCase
 */
export const AggregateTypeSchema = z
  .string()
  .regex(
    /^[A-Z][a-zA-Z0-9]*$/,
    'Aggregate type must be PascalCase (e.g., "Card", "User")'
  )
  .describe('Aggregate type (entity name)');

// ============================================================================
// Base Event Schema
// ============================================================================

/**
 * Schema for base event structure.
 */
export const BaseEventSchema = z.object({
  eventId: EventIdSchema,
  eventType: EventTypeSchema,
  aggregateType: AggregateTypeSchema,
  aggregateId: z.string().min(1).describe('ID of the entity'),
  version: z.number().int().positive().describe('Event schema version'),
  timestamp: IsoDateTimeSchema.describe('When event occurred (UTC)'),
  metadata: EventMetadataSchema,
  payload: z.unknown().describe('Event-specific payload'),
});

/**
 * Create a typed event schema with specific payload.
 */
export function createEventSchema<TPayload extends z.ZodTypeAny>(
  eventType: string,
  aggregateType: string,
  payloadSchema: TPayload
) {
  return BaseEventSchema.extend({
    eventType: z.literal(eventType),
    aggregateType: z.literal(aggregateType),
    payload: payloadSchema,
  });
}

// ============================================================================
// Payload Pattern Schemas
// ============================================================================

/**
 * Schema for event source type.
 */
export const EventSourceTypeSchema = z.enum(['user', 'agent', 'system', 'import']);

/**
 * Schema for state trigger type.
 */
export const StateTriggerSchema = z.enum(['user', 'agent', 'system', 'timeout']);

/**
 * Create a "created" payload schema.
 */
export function createCreatedPayloadSchema<TEntity extends z.ZodTypeAny>(
  entitySchema: TEntity
) {
  return z.object({
    entity: entitySchema,
    source: EventSourceTypeSchema.optional(),
    parentId: z.string().optional(),
    parentType: z.string().optional(),
  });
}

/**
 * Create an "updated" payload schema.
 */
export function createUpdatedPayloadSchema<TChanges extends z.ZodObject<z.ZodRawShape>>(
  changesSchema: TChanges
) {
  return z.object({
    changes: changesSchema,
    previousValues: changesSchema.partial().optional(),
    previousVersion: z.number().int().nonnegative(),
    newVersion: z.number().int().positive(),
    updatedAt: IsoDateTimeSchema,
    reason: z.string().optional(),
  });
}

/**
 * Schema for deleted payload.
 */
export const DeletedPayloadSchema = z.object({
  deletedId: z.string().min(1),
  deletedType: z.string().min(1),
  soft: z.boolean().optional(),
  reason: z.string().optional(),
  snapshot: z.unknown().optional(),
});

/**
 * Create a "state changed" payload schema.
 */
export function createStateChangedPayloadSchema<TState extends z.ZodTypeAny>(
  stateSchema: TState
) {
  return z.object({
    previousState: stateSchema,
    newState: stateSchema,
    reason: z.string().optional(),
    triggeredBy: StateTriggerSchema.optional(),
    context: z.unknown().optional(),
  });
}

/**
 * Schema for telemetry payload.
 */
export const TelemetryPayloadSchema = z.object({
  category: z.string().min(1),
  action: z.string().min(1),
  label: z.string().optional(),
  value: z.number().optional(),
  properties: z.record(z.unknown()).optional(),
});

/**
 * Create a "command result" payload schema.
 */
export function createCommandResultPayloadSchema<TResult extends z.ZodTypeAny>(
  resultSchema: TResult
) {
  return z.object({
    success: z.boolean(),
    result: resultSchema.optional(),
    errorCode: z.string().optional(),
    errorMessage: z.string().optional(),
    durationMs: z.number().nonnegative(),
  });
}

// ============================================================================
// Type Inference
// ============================================================================

export type EventMetadataInput = z.input<typeof EventMetadataSchema>;
export type BaseEventInput = z.input<typeof BaseEventSchema>;
export type EventSourceTypeInput = z.input<typeof EventSourceTypeSchema>;
export type StateTriggerInput = z.input<typeof StateTriggerSchema>;
export type DeletedPayloadInput = z.input<typeof DeletedPayloadSchema>;
export type TelemetryPayloadInput = z.input<typeof TelemetryPayloadSchema>;
