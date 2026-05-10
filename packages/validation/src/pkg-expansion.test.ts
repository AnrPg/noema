import { describe, expect, it } from 'vitest';
import {
  ApplyPkgExpansionSelectionRequestSchema,
  PkgExpansionProposalBundleSchema,
  PkgExpansionRequestSchema,
} from './pkg-expansion.js';

describe('pkg expansion schemas', () => {
  it('parses a domain-scoped expansion request', () => {
    const value = PkgExpansionRequestSchema.parse({
      scope: { scopeType: 'domain', domain: 'statistics', nodeIds: [] },
      studyMode: 'knowledge_gaining',
      limit: 12,
    });

    expect(value.scope.scopeType).toBe('domain');
    expect(value.scope.domain).toBe('statistics');
  });

  it('parses a learner-reviewable proposal bundle and apply request', () => {
    const bundle = PkgExpansionProposalBundleSchema.parse({
      artifactKind: 'pkg_expansion_proposal_bundle',
      scope: { scopeType: 'whole_pkg', nodeIds: [] },
      generatedAt: new Date().toISOString(),
      summary: {
        proposalCount: 1,
        nodeProposalCount: 0,
        edgeProposalCount: 1,
        wordingProposalCount: 0,
        canonicalCandidateCount: 0,
      },
      proposals: [
        {
          proposalId: 'proposal_1',
          category: 'structural_optimization',
          title: 'Add prerequisite support',
          summary: 'Connect Bayes theorem to conditional probability.',
          whyThisHelps: 'The graph becomes easier to interpret.',
          whatWillChange: 'Add a prerequisite edge.',
          confidenceLabel: 'high',
          evidenceSummary: 'Inferred from concept structure.',
          scope: { scopeType: 'node', nodeIds: ['node_bayes'] },
          affectedNodeIds: ['node_bayes', 'node_conditional_probability'],
          affectedNodeLabels: ['Bayes theorem', 'Conditional probability'],
          pkgOperations: [
            {
              type: 'add_edge',
              sourceNodeId: 'node_conditional_probability',
              targetNodeId: 'node_bayes',
              edgeType: 'prerequisite',
              weight: 0.8,
            },
          ],
          ckgOperations: [],
        },
      ],
    });

    const apply = ApplyPkgExpansionSelectionRequestSchema.parse({
      scope: bundle.scope,
      selectedProposalIds: ['proposal_1'],
      proposals: bundle.proposals,
      forwardCanonical: true,
    });

    expect(apply.selectedProposalIds).toEqual(['proposal_1']);
  });
});
