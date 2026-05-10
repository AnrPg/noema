import { z } from 'zod';
import { JsonValueSchema } from './base.js';

export const GraphAgentPopulationModeSchema = z.enum([
  'call_time',
  'deterministic_prefetch',
  'static_policy',
  'llm_generated_by_agent',
  'unavailable',
]);

export const GraphAgentPopulationReportSchema = z.object({
  mode: GraphAgentPopulationModeSchema,
  source: z.string().min(1),
  notes: z.string().optional(),
});

export const GraphAgentPopulationEntrySchema = z.object({
  fieldPath: z.string().min(1),
  mode: GraphAgentPopulationModeSchema,
  source: z.string().min(1),
  toolOrFunction: z.string().min(1).optional(),
  agentName: z.string().min(1).optional(),
  status: z.enum(['populated', 'empty', 'unavailable', 'error']),
  input: JsonValueSchema.optional(),
  error: JsonValueSchema.optional(),
});

export const GraphAgentRelationItemSchema = z.object({
  relationRef: z.string().min(1),
  sourceConceptRef: z.string().min(1),
  targetConceptRef: z.string().min(1),
  sourceLabel: z.string().min(1),
  targetLabel: z.string().min(1),
  relationship: z.string().min(1),
  explanation: z.string().nullable(),
  confidenceScore: z.number().min(0).max(1).nullable(),
  population: GraphAgentPopulationReportSchema,
});

export const GraphAgentPromptV1Schema = z.object({
  schemaVersion: z.literal('graph_agent_prompt.v1'),
  promptProfileVersion: z.string().min(1).optional(),
  instructions: z.object({
    reasoningRule: z.string().min(1),
    domainAssignmentRule: z.string().min(1),
    domainDiscoveryRule: z.string().min(1),
    proposalCoverageRule: z.string().min(1),
    edgeTypeGuidance: z.string().min(1),
    nodeTypeGuidance: z.string().min(1),
  }),
  pedagogicalContext: z.object({
    requestedOperation: z.object({
      operationName: z.string().min(1).optional(),
      operationType: z.enum([
        'add_node',
        'add_edge',
        'add_prerequisite',
        'update_node',
        'remove_node',
        'remove_edge',
        'merge_nodes',
        'split_node',
        'anchor',
        'content_readiness',
        'ask_for_mapping_choice',
        'expand_pkg',
      ]),
      graphScope: z.enum(['pkg', 'ckg', 'both']),
      domain: z.string().nullable(),
      studyMode: z.enum(['knowledge_gaining', 'language_learning']).nullable(),
      purpose: z.string().min(1),
      expansionScope: z
        .object({
          scopeType: z.enum(['whole_pkg', 'node', 'domain']),
          nodeIds: z.array(z.string()).default([]),
          domain: z.string().nullable().optional(),
        })
        .optional(),
      population: GraphAgentPopulationReportSchema,
    }),
    targetConcepts: z.array(
      z.object({
        conceptRef: z.string().min(1),
        label: z.string().min(1),
        description: z.string().nullable(),
        domain: z.string().nullable(),
        studyMode: z.enum(['knowledge_gaining', 'language_learning']).nullable(),
        aliases: z.array(z.string()),
        learnerFacingSummary: z.string().nullable(),
        population: GraphAgentPopulationReportSchema,
      })
    ),
    relationCandidates: z.object({
      prerequisites: z.array(GraphAgentRelationItemSchema),
      related: z.array(GraphAgentRelationItemSchema),
      contrasts: z.array(GraphAgentRelationItemSchema),
      confusables: z.array(GraphAgentRelationItemSchema),
      misconceptionLinks: z.array(GraphAgentRelationItemSchema),
    }),
    learnerGraphSignals: z.object({
      structuralHealth: JsonValueSchema.nullable(),
      reasoningByConceptRef: z.record(JsonValueSchema.nullable()),
      scheduleByConceptRef: z.record(JsonValueSchema.nullable()),
      misconceptionSignals: z.array(JsonValueSchema),
      population: GraphAgentPopulationReportSchema,
    }),
    sourceEvidence: z.array(
      z.object({
        evidenceRef: z.string().min(1),
        documentRef: z.string().nullable(),
        chunkRef: z.string().nullable(),
        excerpt: z.string().min(1),
        citationLabel: z.string().nullable(),
        population: GraphAgentPopulationReportSchema,
      })
    ),
    policyContext: z.object({
      pkgWritePolicy: z.literal('single_user_confirmation'),
      ckgWritePolicy: z.literal('mutation_dsl_review_pipeline'),
      allowedOperationTypes: z.array(z.string()),
      allowedEdgeTypes: z.array(z.string()),
      allowedNodeTypes: z.array(z.string()),
      existingDomains: z.array(z.string()),
      discouragedDomains: z.array(z.string()),
      population: GraphAgentPopulationReportSchema,
    }),
    ambiguities: z.array(
      z.object({
        ambiguityRef: z.string().min(1),
        kind: z.enum(['duplicate_candidate', 'unresolved_identity', 'mode_collision', 'weak_relation']),
        message: z.string().min(1),
        affectedConceptRefs: z.array(z.string()),
        candidates: z.array(JsonValueSchema),
        population: GraphAgentPopulationReportSchema,
      })
    ),
    expansionScope: z
      .object({
        scopeType: z.enum(['whole_pkg', 'node', 'domain']),
        nodeIds: z.array(z.string()).default([]),
        domain: z.string().nullable().optional(),
      })
      .optional(),
  }),
  serviceContract: z.object({
    identityMap: z.object({
      concepts: z.array(
        z.object({
          conceptRef: z.string().min(1),
          inputRef: z.string().min(1),
          conceptId: z.string().nullable(),
          pkgNodeId: z.string().nullable(),
          ckgNodeId: z.string().nullable(),
          selectedNodeIds: z.array(z.string()),
          resolvedGraphType: z.enum(['pkg', 'ckg', 'both', 'unresolved']),
        })
      ),
      documents: z.array(z.object({ documentRef: z.string().min(1), documentId: z.string().min(1) })),
    }),
    pkgWritePlan: z.object({
      requiresUserConfirmation: z.literal(true),
      confirmationMessage: z.string().min(1),
      operations: z.array(JsonValueSchema),
      ready: z.boolean(),
    }),
    ckgMutationPlan: z.object({
      operations: z.array(JsonValueSchema),
      rationale: z.string().min(1),
      evidenceCount: z.number().int().nonnegative(),
      priority: z.number().int().min(0).max(100),
      ready: z.boolean(),
      blockedReasons: z.array(z.string()),
    }),
    toolCallInputs: z.record(JsonValueSchema),
    reviewRouting: z.object({
      pkg: z.object({ surface: z.literal('pkg-confirmation-dialog'), requiresReview: z.literal(false) }),
      ckg: z.object({ surface: z.literal('knowledge-graph-review-queue'), requiresReview: z.literal(true) }),
    }),
    idempotencyKeys: z.object({
      graphBrief: z.string().min(1),
      pkgWrite: z.string().min(1),
      ckgMutation: z.string().min(1),
    }),
  }),
  populationReport: z.object({
    callTime: z.array(GraphAgentPopulationEntrySchema),
    deterministicPrefetch: z.array(GraphAgentPopulationEntrySchema),
    staticPolicy: z.array(GraphAgentPopulationEntrySchema),
    llmGeneratedByAgent: z.array(GraphAgentPopulationEntrySchema),
    unavailable: z.array(GraphAgentPopulationEntrySchema),
  }),
});

export const GraphReadinessReportV1Schema = z.object({
  schemaVersion: z.literal('graph_readiness_report.v1'),
  operationName: z.string().min(1).optional(),
  scope: z
    .object({
      scopeType: z.enum(['whole_pkg', 'node', 'domain']),
      nodeIds: z.array(z.string()).default([]),
      domain: z.string().nullable().optional(),
    })
    .optional(),
  status: z.enum(['finalized', 'blocked']),
  graphPrompt: GraphAgentPromptV1Schema,
  concepts: z.array(
    z.object({
      conceptRef: z.string().min(1),
      inputRef: z.string().min(1),
      conceptId: z.string().nullable(),
      pkgNodeId: z.string().nullable(),
      ckgNodeId: z.string().nullable(),
      label: z.string().min(1),
      domain: z.string().nullable(),
      aliases: z.array(z.string()),
      learnerFacingSummary: z.string().nullable(),
      prerequisites: z.array(GraphAgentRelationItemSchema),
      relatedConcepts: z.array(GraphAgentRelationItemSchema),
      contrasts: z.array(GraphAgentRelationItemSchema),
      confusables: z.array(GraphAgentRelationItemSchema),
      misconceptionLinks: z.array(GraphAgentRelationItemSchema),
      persisted: z.boolean(),
    })
  ),
  unresolved: z.array(JsonValueSchema),
  blockedReasons: z.array(z.string()),
});

export const GraphMutationDraftV1Schema = z.object({
  schemaVersion: z.literal('graph_mutation_draft.v1'),
  graphPromptRef: z.string().min(1),
  pkgWritePlan: GraphAgentPromptV1Schema.shape.serviceContract.shape.pkgWritePlan,
  ckgMutationPlan: GraphAgentPromptV1Schema.shape.serviceContract.shape.ckgMutationPlan,
});

export type GraphAgentPromptV1Input = z.input<typeof GraphAgentPromptV1Schema>;
export type GraphReadinessReportV1Input = z.input<typeof GraphReadinessReportV1Schema>;
export type GraphMutationDraftV1Input = z.input<typeof GraphMutationDraftV1Schema>;
