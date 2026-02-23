import { CardIdSchema, UserIdSchema } from '@noema/validation';
import { z } from 'zod';

export const DualLanePlanInputSchema = z.object({
  userId: UserIdSchema,
  retentionCardIds: z.array(CardIdSchema).default([]),
  calibrationCardIds: z.array(CardIdSchema).default([]),
  targetMix: z
    .object({
      retention: z.number().min(0).max(1),
      calibration: z.number().min(0).max(1),
    })
    .optional(),
  maxCards: z.number().int().min(1).max(500),
});
