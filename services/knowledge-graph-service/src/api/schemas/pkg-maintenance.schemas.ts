import { z } from 'zod';

export const PkgBulkDeleteRequestSchema = z.object({
  nodeIds: z.array(z.string().min(1)).min(1),
});

export const PkgResetRequestSchema = z.object({
  confirmation: z.literal('DELETE_ALL_PKG_CONTENTS'),
});

export type PkgBulkDeleteRequest = z.infer<typeof PkgBulkDeleteRequestSchema>;
export type PkgResetRequest = z.infer<typeof PkgResetRequestSchema>;
