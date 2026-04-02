import { z } from 'zod';

export const CkgResetRequestSchema = z.object({
  confirmation: z.literal('DELETE_ALL_CKG_CONTENTS'),
  includeSources: z.boolean().default(false),
});

export type CkgResetRequest = z.infer<typeof CkgResetRequestSchema>;
