import { z } from 'zod';

export const GraphSnapshotCreateRequestSchema = z
  .discriminatedUnion('graphType', [
    z.object({
      graphType: z.literal('pkg'),
      userId: z.string().min(1, 'userId is required'),
      domain: z.string().min(1).optional(),
      reason: z.string().min(1).max(2000).optional(),
    }),
    z.object({
      graphType: z.literal('ckg'),
      domain: z.string().min(1).optional(),
      reason: z.string().min(1).max(2000).optional(),
    }),
  ])
  .superRefine((value, ctx) => {
    if (value.graphType === 'pkg' && value.userId.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['userId'],
        message: 'userId is required for PKG snapshots',
      });
    }
  });

export const GraphSnapshotQueryParamsSchema = z.object({
  graphType: z.enum(['pkg', 'ckg']).optional(),
  userId: z.string().min(1).optional(),
  domain: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type GraphSnapshotCreateRequest = z.infer<typeof GraphSnapshotCreateRequestSchema>;
export type GraphSnapshotQueryParams = z.infer<typeof GraphSnapshotQueryParamsSchema>;
