import { z } from 'zod';

export const GraphCrdtStatsQueryParamsSchema = z.object({
  targetKind: z.enum(['ckg_node', 'proposed_label']).optional(),
  targetNodeId: z.string().min(1).optional(),
  proposedLabel: z.string().min(1).optional(),
  evidenceType: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type GraphCrdtStatsQueryParams = z.infer<typeof GraphCrdtStatsQueryParamsSchema>;
