/**
 * @noema/knowledge-graph-service - PKG Mastery API Schemas
 *
 * Zod validation schemas for explicit mastery read-model routes.
 */

import { StudyModeSchema } from '@noema/validation';
import { z } from 'zod';

export const MasterySummaryQueryParamsSchema = z.object({
  studyMode: StudyModeSchema,
  domain: z.string().min(1).max(200).optional(),
  masteryThreshold: z.coerce.number().min(0).max(1).default(0.7),
});

export type MasterySummaryQueryParams = z.infer<typeof MasterySummaryQueryParamsSchema>;
