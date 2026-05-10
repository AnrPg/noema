import { z } from 'zod';
import { JsonValueSchema } from './base.js';

export const PkgExpansionScopeTypeSchema = z.enum(['whole_pkg', 'node', 'domain']);

export const PkgExpansionCategorySchema = z.enum([
  'expand_nodes',
  'expand_edges',
  'structural_optimization',
  'semantic_optimization',
  'label_improvement',
  'description_improvement',
]);

export const PkgExpansionScopeSchema = z.object({
  scopeType: PkgExpansionScopeTypeSchema,
  nodeIds: z.array(z.string().min(1)).default([]),
  domain: z.string().min(1).nullable().optional(),
});

export const PkgExpansionRequestSchema = z.object({
  scope: PkgExpansionScopeSchema,
  studyMode: z.enum(['knowledge_gaining', 'language_learning']).nullable().optional(),
  limit: z.number().int().positive().max(100).optional(),
});

export const PkgExpansionProposalPreviewSchema = z
  .object({
    beforeLabel: z.string().nullable().optional(),
    afterLabel: z.string().nullable().optional(),
    beforeDescription: z.string().nullable().optional(),
    afterDescription: z.string().nullable().optional(),
  })
  .partial();

export const PkgExpansionCanonicalSuggestionSchema = z.object({
  queued: z.boolean(),
  rationale: z.string().nullable().optional(),
  operations: z.array(JsonValueSchema).default([]),
});

export const PkgExpansionProposalItemSchema = z.object({
  proposalId: z.string().min(1),
  category: PkgExpansionCategorySchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  whyThisHelps: z.string().min(1),
  whatWillChange: z.string().min(1),
  confidenceLabel: z.enum(['high', 'medium', 'low']),
  evidenceSummary: z.string().min(1),
  scope: PkgExpansionScopeSchema,
  affectedNodeIds: z.array(z.string().min(1)).default([]),
  affectedNodeLabels: z.array(z.string().min(1)).default([]),
  preview: PkgExpansionProposalPreviewSchema.optional(),
  pkgOperations: z.array(JsonValueSchema).default([]),
  ckgOperations: z.array(JsonValueSchema).default([]),
  canonicalSuggestion: PkgExpansionCanonicalSuggestionSchema.optional(),
});

export const PkgExpansionProposalBundleSchema = z.object({
  artifactKind: z.literal('pkg_expansion_proposal_bundle'),
  scope: PkgExpansionScopeSchema,
  generatedAt: z.string().min(1),
  summary: z.object({
    proposalCount: z.number().int().nonnegative(),
    nodeProposalCount: z.number().int().nonnegative(),
    edgeProposalCount: z.number().int().nonnegative(),
    wordingProposalCount: z.number().int().nonnegative(),
    canonicalCandidateCount: z.number().int().nonnegative(),
  }),
  proposals: z.array(PkgExpansionProposalItemSchema),
});

export const ApplyPkgExpansionSelectionRequestSchema = z.object({
  scope: PkgExpansionScopeSchema,
  selectedProposalIds: z.array(z.string().min(1)).min(1),
  proposals: z.array(PkgExpansionProposalItemSchema),
  forwardCanonical: z.boolean().default(true),
});

export const ApplyPkgExpansionSelectionResultSchema = z.object({
  appliedProposalIds: z.array(z.string().min(1)),
  createdNodeIds: z.array(z.string().min(1)),
  createdEdgeIds: z.array(z.string().min(1)),
  updatedNodeIds: z.array(z.string().min(1)),
  canonicalMutationIds: z.array(z.string().min(1)),
  skippedProposalIds: z.array(z.string().min(1)),
  message: z.string().min(1),
});

export type PkgExpansionRequestInput = z.input<typeof PkgExpansionRequestSchema>;
export type PkgExpansionProposalBundleInput = z.input<typeof PkgExpansionProposalBundleSchema>;
export type PkgExpansionProposalItemInput = z.input<typeof PkgExpansionProposalItemSchema>;
export type ApplyPkgExpansionSelectionRequestInput = z.input<
  typeof ApplyPkgExpansionSelectionRequestSchema
>;
export type ApplyPkgExpansionSelectionResultInput = z.input<
  typeof ApplyPkgExpansionSelectionResultSchema
>;
