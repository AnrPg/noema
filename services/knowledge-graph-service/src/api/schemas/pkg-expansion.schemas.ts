import {
  ApplyPkgExpansionSelectionRequestSchema,
  PkgExpansionRequestSchema,
} from '@noema/validation';
import { z } from 'zod';

export { ApplyPkgExpansionSelectionRequestSchema, PkgExpansionRequestSchema };

export const ApplyGraphAgentProposalSelectionRequestSchema = z.object({
  selectedProposalIds: z.array(z.string().min(1)).min(1),
  proposals: z.array(
    z.object({
      proposalId: z.string().min(1),
      conceptId: z.string().nullable().optional(),
      proposalType: z.string().nullable().optional(),
      operation: z.record(z.unknown()),
      rationale: z.string().nullable().optional(),
      confidenceScore: z.number().nullable().optional(),
      reviewState: z.string().nullable().optional(),
      sourceDocumentIds: z.array(z.string().min(1)).optional(),
      candidateLabel: z.string().nullable().optional(),
      metadata: z.record(z.unknown()).optional(),
      ckgOperations: z.array(z.record(z.unknown())).optional(),
    })
  ),
  forwardCanonical: z.boolean().default(true),
});
