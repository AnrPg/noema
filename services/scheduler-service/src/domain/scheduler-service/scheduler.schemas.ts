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

export const OfflineIntentTokenInputSchema = z.object({
  userId: UserIdSchema,
  sessionBlueprint: z.unknown(),
  expiresInSeconds: z.number().int().min(60).max(60 * 60 * 24),
});

export const VerifyOfflineIntentTokenInputSchema = z.object({
  token: z.string().min(1),
});
