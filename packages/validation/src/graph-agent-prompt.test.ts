import { describe, expect, it } from 'vitest';
import {
  GraphAgentPromptV1Schema,
  GraphMutationDraftV1Schema,
  GraphReadinessReportV1Schema,
} from './graph-agent-prompt.js';

const population = { mode: 'deterministic_prefetch' as const, source: 'test' };

function completePrompt() {
  return {
    schemaVersion: 'graph_agent_prompt.v1',
    instructions: {
      reasoningRule:
        'Use pedagogicalContext for reasoning. Use serviceContract only for IDs, schema compliance, and downstream handoff.',
      domainAssignmentRule:
        'Do not default to general. Reuse the most specific evidenced domain from the target concepts, surrounding graph, or source evidence; multiple domains across touched nodes are allowed.',
      domainDiscoveryRule:
        'Actively infer plausible domain candidates for each touched node. Prefer an existing graph domain when it truly fits, but do not force the choice to come only from the existing list.',
      proposalCoverageRule:
        'Expansion proposals should produce connected structure, not isolated nodes. When proposing a new node, include at least one justified edge whenever evidence supports it.',
      edgeTypeGuidance:
        'Prefer the most specific edge type available. Use related_to only as a last-resort associative fallback.',
      nodeTypeGuidance:
        'Use notion for general concepts, skill for competencies, occupation for job roles, fact for atomic truths, procedure for stepwise methods, principle for governing rules, example/counterexample for illustrative instances, and misconception for incorrect models to repair.',
    },
    pedagogicalContext: {
      requestedOperation: {
        operationType: 'add_prerequisite',
        graphScope: 'both',
        domain: 'statistics',
        studyMode: 'knowledge_gaining',
        purpose: 'Prepare graph context for content generation.',
        population: { mode: 'call_time', source: 'caller' },
      },
      targetConcepts: [
        {
          conceptRef: 'c1',
          label: 'Bayes theorem',
          description: 'Updates belief after evidence.',
          domain: 'statistics',
          studyMode: 'knowledge_gaining',
          aliases: ['Bayes rule'],
          learnerFacingSummary: 'Bayes theorem updates probabilities using evidence.',
          population,
        },
      ],
      relationCandidates: {
        prerequisites: [
          {
            relationRef: 'r1',
            sourceConceptRef: 'c2',
            targetConceptRef: 'c1',
            sourceLabel: 'Conditional probability',
            targetLabel: 'Bayes theorem',
            relationship: 'prerequisite',
            explanation: 'Conditional probability is needed before Bayes theorem.',
            confidenceScore: 0.8,
            population,
          },
        ],
        related: [],
        contrasts: [],
        confusables: [],
        misconceptionLinks: [],
      },
      learnerGraphSignals: {
        structuralHealth: { status: 'ok' },
        reasoningByConceptRef: { c1: { averageReasoning: 0.7 } },
        scheduleByConceptRef: { c1: { queue: 'new' } },
        misconceptionSignals: [],
        population,
      },
      sourceEvidence: [
        {
          evidenceRef: 'e1',
          documentRef: 'd1',
          chunkRef: 'chunk_1',
          excerpt: 'Bayes theorem updates probabilities using evidence.',
          citationLabel: 'Demo source #1',
          population,
        },
      ],
      policyContext: {
        pkgWritePolicy: 'single_user_confirmation',
        ckgWritePolicy: 'mutation_dsl_review_pipeline',
        allowedOperationTypes: ['add_node', 'add_edge'],
        allowedEdgeTypes: ['prerequisite', 'related_to', 'confusable_with'],
        allowedNodeTypes: ['notion', 'skill', 'occupation', 'fact'],
        existingDomains: ['statistics', 'probability', 'mathematics'],
        discouragedDomains: ['general'],
        population: { mode: 'static_policy', source: 'knowledge-graph-service' },
      },
      ambiguities: [],
    },
    serviceContract: {
      identityMap: {
        concepts: [
          {
            conceptRef: 'c1',
            inputRef: 'Bayes theorem',
            conceptId: 'concept_bayes_theorem_demo',
            pkgNodeId: 'node_bayes_theorem_demo',
            ckgNodeId: 'node_ckg_bayes_demo',
            selectedNodeIds: [],
            resolvedGraphType: 'both',
          },
        ],
        documents: [{ documentRef: 'd1', documentId: 'doc_graph_agent_demo' }],
      },
      pkgWritePlan: {
        requiresUserConfirmation: true,
        confirmationMessage: 'Confirm one PKG graph update.',
        operations: [],
        ready: true,
      },
      ckgMutationPlan: {
        operations: [
          {
            type: 'add_edge',
            edgeType: 'prerequisite',
            sourceNodeId: 'node_conditional_probability_demo',
            targetNodeId: 'node_ckg_bayes_demo',
            weight: 0.8,
            rationale: 'Conditional probability supports Bayes theorem.',
          },
        ],
        rationale: 'Prepare prerequisite structure.',
        evidenceCount: 1,
        priority: 10,
        ready: true,
        blockedReasons: [],
      },
      toolCallInputs: {},
      reviewRouting: {
        pkg: { surface: 'pkg-confirmation-dialog', requiresReview: false },
        ckg: { surface: 'knowledge-graph-review-queue', requiresReview: true },
      },
      idempotencyKeys: {
        graphBrief: 'graph_brief_demo',
        pkgWrite: 'pkg_write_demo',
        ckgMutation: 'ckg_mutation_demo',
      },
    },
    populationReport: {
      callTime: [],
      deterministicPrefetch: [],
      staticPolicy: [],
      llmGeneratedByAgent: [],
      unavailable: [],
    },
  };
}

describe('GraphAgentPromptV1Schema', () => {
  it('accepts a complete graph prompt with ID handoff isolated in serviceContract', () => {
    const prompt = GraphAgentPromptV1Schema.parse(completePrompt());

    expect(prompt.pedagogicalContext.targetConcepts[0]?.label).toBe('Bayes theorem');
    expect(prompt.serviceContract.ckgMutationPlan.operations[0]).toMatchObject({
      sourceNodeId: 'node_conditional_probability_demo',
      targetNodeId: 'node_ckg_bayes_demo',
    });
  });

  it('validates graph readiness and mutation draft wrappers', () => {
    const graphPrompt = completePrompt();
    const readiness = GraphReadinessReportV1Schema.parse({
      schemaVersion: 'graph_readiness_report.v1',
      status: 'finalized',
      graphPrompt,
      concepts: [
        {
          conceptRef: 'c1',
          inputRef: 'Bayes theorem',
          conceptId: 'concept_bayes_theorem_demo',
          pkgNodeId: 'node_bayes_theorem_demo',
          ckgNodeId: 'node_ckg_bayes_demo',
          label: 'Bayes theorem',
          domain: 'statistics',
          aliases: [],
          learnerFacingSummary: 'Bayes theorem updates probabilities using evidence.',
          prerequisites: [],
          relatedConcepts: [],
          contrasts: [],
          confusables: [],
          misconceptionLinks: [],
          persisted: true,
        },
      ],
      unresolved: [],
      blockedReasons: [],
    });

    expect(readiness.status).toBe('finalized');
    expect(
      GraphMutationDraftV1Schema.parse({
        schemaVersion: 'graph_mutation_draft.v1',
        graphPromptRef: 'graph_brief_demo',
        pkgWritePlan: graphPrompt.serviceContract.pkgWritePlan,
        ckgMutationPlan: graphPrompt.serviceContract.ckgMutationPlan,
      }).ckgMutationPlan.ready
    ).toBe(true);
  });
});
