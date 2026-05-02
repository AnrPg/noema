import { StudyModeSchema } from '@noema/validation';
import { z } from 'zod';

export const ConceptStateQueryParamsSchema = z.object({
  userId: z.string().min(1),
  studyMode: StudyModeSchema.default('knowledge_gaining'),
});

export const ConceptStateHistoryQueryParamsSchema = ConceptStateQueryParamsSchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const StabilitySummaryQueryParamsSchema = z.object({
  studyMode: StudyModeSchema.default('knowledge_gaining'),
});

export type ConceptStateQueryParams = z.infer<typeof ConceptStateQueryParamsSchema>;
export type ConceptStateHistoryQueryParams = z.infer<typeof ConceptStateHistoryQueryParamsSchema>;
export type StabilitySummaryQueryParams = z.infer<typeof StabilitySummaryQueryParamsSchema>;
