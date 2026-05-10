/**
 * @noema/knowledge-graph-service - Domain Suggestion API Schemas
 */

import { GraphNodeTypeSchema, StudyModeSchema, UserIdSchema } from '@noema/validation';
import { z } from 'zod';

export const DomainSuggestionQuerySchema = z.object({
  userId: UserIdSchema.optional(),
  label: z.string().max(200).optional(),
  nodeType: GraphNodeTypeSchema.optional(),
  studyMode: StudyModeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(10).default(6),
});

export type DomainSuggestionQuery = z.infer<typeof DomainSuggestionQuerySchema>;
