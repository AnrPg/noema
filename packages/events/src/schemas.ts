/**
 * @noema/events - Event Schemas
 *
 * Zod schemas for runtime validation of events.
 */

import {
  AgentIdSchema,
  CausationIdSchema,
  CorrelationIdSchema,
  EnvironmentSchema,
  EventIdSchema,
  IsoDateTimeSchema,
  MetadataSchema,
  SessionIdSchema,
  UserIdSchema,
} from '@noema/validation';
import { z } from 'zod';

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
  .regex(/^[A-Z][a-zA-Z0-9]*$/, 'Aggregate type must be PascalCase (e.g., "Card", "User")')
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
): z.ZodObject<{
  eventId: typeof EventIdSchema;
  eventType: z.ZodLiteral<string>;
  aggregateType: z.ZodLiteral<string>;
  aggregateId: z.ZodString;
  version: z.ZodNumber;
  timestamp: z.ZodString;
  metadata: typeof EventMetadataSchema;
  payload: TPayload;
}> {
  return BaseEventSchema.extend({
    eventType: z.literal(eventType),
    aggregateType: z.literal(aggregateType),
    payload: payloadSchema,
  });
}

// ============================================================================
// Type Inference
// ============================================================================

export type EventMetadataInput = z.input<typeof EventMetadataSchema>;
export type BaseEventInput = z.input<typeof BaseEventSchema>;
