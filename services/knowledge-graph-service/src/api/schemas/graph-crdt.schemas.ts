import { z } from 'zod';

export const GraphCrdtStatsQueryParamsSchema = z.object({
  targetKind: z.enum(['ckg_node', 'proposed_label']).optional(),
  targetNodeId: z.string().min(1).optional(),
  proposedLabel: z.string().min(1).optional(),
  evidenceType: z.string().min(1).optional(),
});

export type GraphCrdtStatsQueryParams = z.infer<typeof GraphCrdtStatsQueryParamsSchema>;
