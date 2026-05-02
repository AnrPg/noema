import { z } from 'zod';

export const CkgResetRequestSchema = z.object({
  confirmation: z.literal('DELETE_ALL_CKG_CONTENTS'),
  includeSources: z.boolean().default(false),
});

export const CkgSourcePurgeRequestSchema = z.object({
  confirmation: z.literal('DELETE_SELECTED_CKG_STREAM'),
  streamId: z.string().min(1),
  includeSourceRegistration: z.boolean().default(false),
});

export type CkgResetRequest = z.infer<typeof CkgResetRequestSchema>;
export type CkgSourcePurgeRequest = z.infer<typeof CkgSourcePurgeRequestSchema>;
