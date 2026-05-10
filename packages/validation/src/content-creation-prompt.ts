/**
 * @noema/validation - Content creation prompt contracts
 *
 * Canonical prompt schema for the content-creation-orchestrator →
 * content-creator-agent handoff.
 */

import { z } from 'zod';
import { JsonValueSchema } from './base.js';

export const ContentCreationPopulationModeSchema = z.enum([
  'deterministic_prefetch',
  'static_policy',
  'call_time',
  'llm_generated_by_agent',
  'unavailable',
]);

export const ContentCreationPopulationReportSchema = z.object({
  mode: ContentCreationPopulationModeSchema,
  source: z.string().min(1),
  notes: z.string().optional(),
});

export const ContentCreationPopulationEntrySchema = z.object({
  fieldPath: z.string().min(1),
  mode: ContentCreationPopulationModeSchema,
  source: z.string().min(1),
  toolOrFunction: z.string().min(1).optional(),
  agentName: z.string().min(1).optional(),
  input: JsonValueSchema.optional(),
  status: z.enum(['populated', 'empty', 'unavailable', 'error']),
  error: JsonValueSchema.optional(),
});

export const ContentCreationRelationPackSchema = z.object({
  items: z.array(
    z.object({
      label: z.string().min(1),
      relationship: z.string().min(1),
      explanation: z.string().nullable(),
    })
  ),
  population: ContentCreationPopulationReportSchema,
});

export const ContentCreationMoodSignalSchema = z.object({
  label: z.string().min(1),
  confidence: z.number().min(0).max(1).nullable(),
  source: z.string().min(1),
});

export const ContentCreationLoadSignalSchema = z.object({
  label: z.enum(['low', 'medium', 'high', 'unknown']),
  evidence: z.array(z.string()),
});

export const ContentCreationPromptV2Schema = z.object({
  schemaVersion: z.literal('content_creation_prompt.v2'),
  promptProfileVersion: z.string().min(1).optional(),
  instructions: z.object({
    reasoningRule: z.literal(
      'Use pedagogicalContext for reasoning. Use serviceContract only for IDs, schema compliance, and downstream handoff.'
    ),
  }),
  pedagogicalContext: z.object({
    generationIntent: z.object({
      operationName: z.string().min(1).optional(),
      trigger: z.enum([
        'curriculum_gap',
        'source_ingestion',
        'learner_repair',
        'frontier_progression',
        'practice_variety',
        'transformation',
        'graph_gap',
        'manual_author_request',
      ]),
      purpose: z.string().min(1),
      pedagogicalMove: z.enum([
        'introduce',
        'reinforce',
        'repair',
        'contrast',
        'discriminate',
        'apply',
        'transfer',
        'calibrate',
        'assess',
      ]),
      artifactScope: z.enum(['cards', 'activity_variants', 'cards_and_activity_variants']),
      sourcePolicy: z.enum(['rag_required', 'rag_allowed', 'autonomous_allowed']),
      personalizationPolicy: z.enum([
        'none',
        'concept_state',
        'learner_state',
        'full_personalization',
      ]),
      population: ContentCreationPopulationReportSchema,
    }),
    targetConcepts: z.array(
      z.object({
        conceptRef: z.string().min(1),
        label: z.string().min(1),
        description: z.string().nullable(),
        domain: z.string().nullable(),
        studyMode: z.enum(['knowledge_gaining', 'language_learning']),
        aliases: z.array(z.string()),
        learnerFacingSummary: z.string().nullable(),
        population: ContentCreationPopulationReportSchema,
      })
    ),
    conceptRelations: z.object({
      prerequisitesByConceptRef: z.record(ContentCreationRelationPackSchema),
      relatedConceptsByConceptRef: z.record(ContentCreationRelationPackSchema),
      contrastsByConceptRef: z.record(ContentCreationRelationPackSchema),
      confusablesByConceptRef: z.record(ContentCreationRelationPackSchema),
      misconceptionLinksByConceptRef: z.record(ContentCreationRelationPackSchema),
    }),
    learnerState: z.object({
      global: z.object({
        displayName: z.string().nullable(),
        preferredLanguage: z.string().nullable(),
        currentMood: ContentCreationMoodSignalSchema.nullable(),
        cognitiveLoad: ContentCreationLoadSignalSchema.nullable(),
        fatigue: ContentCreationLoadSignalSchema.nullable(),
        motivation: ContentCreationMoodSignalSchema.nullable(),
        population: ContentCreationPopulationReportSchema,
      }),
      byConceptRef: z.record(
        z.object({
          scheduleState: JsonValueSchema.nullable(),
          stabilityLabel: z.string().nullable(),
          reasoningAverage: JsonValueSchema.nullable(),
          confidenceCalibration: JsonValueSchema.nullable(),
          recentFailureModes: z.array(JsonValueSchema),
          misconceptionSignals: z.array(JsonValueSchema),
          recommendedRepairMove: z.string().nullable(),
          difficultyRecommendation: z.string().nullable(),
          population: ContentCreationPopulationReportSchema,
        })
      ),
    }),
    curriculumContext: z.object({
      curriculumTitle: z.string().nullable(),
      activeVersionLabel: z.string().nullable(),
      selectedNodes: z.array(
        z.object({ nodeRef: z.string().min(1), label: z.string().min(1), role: z.string().nullable() })
      ),
      frontierNodes: z.array(
        z.object({
          nodeRef: z.string().min(1),
          label: z.string().min(1),
          readinessReason: z.string().nullable(),
        })
      ),
      nearbyCurriculumNodes: z.array(
        z.object({
          nodeRef: z.string().min(1),
          label: z.string().min(1),
          relationshipToTarget: z.string().min(1),
        })
      ),
      population: ContentCreationPopulationReportSchema,
    }),
    contentCoverageContext: z.object({
      byConceptRef: z.record(
        z.object({
          existingCards: z.array(
            z.object({
              cardRef: z.string().min(1),
              cardType: z.string().min(1),
              front: z.string(),
              backSummary: z.string(),
              difficulty: z.string().min(1),
              tags: z.array(z.string()),
            })
          ),
          existingActivityVariants: z.array(
            z.object({
              variantRef: z.string().min(1),
              prompt: z.string(),
              transformationType: z.string().min(1),
              difficultyBucket: z.number().int(),
            })
          ),
          coverageSummary: z.string().nullable(),
          missingCardTypes: z.array(z.string()),
          missingActivityTypes: z.array(z.string()),
          duplicateRisks: z.array(z.string()),
          population: ContentCreationPopulationReportSchema,
        })
      ),
    }),
    ragContext: z.object({
      sourcePolicy: z.enum(['required', 'allowed', 'not_used']),
      documents: z.array(
        z.object({
          documentRef: z.string().min(1),
          title: z.string().min(1),
          outline: JsonValueSchema.nullable(),
          sourceKind: z.string().nullable(),
        })
      ),
      evidenceByConceptRef: z.record(
        z.array(
          z.object({
            documentRef: z.string().min(1),
            chunkRef: z.string().min(1),
            excerpt: z.string(),
            locator: z.string().nullable(),
            citationLabel: z.string().min(1),
            confidence: z.number().min(0).max(1).nullable(),
          })
        )
      ),
      citationRules: z.array(z.string()),
      unsupportedClaimPolicy: z.enum(['reject', 'mark_uncertain']),
      population: ContentCreationPopulationReportSchema,
    }),
    guardianPolicy: z.object({
      learnerSafetyRules: z.array(z.string()),
      factualityRules: z.array(z.string()),
      answerLeakageRules: z.array(z.string()),
      malformedArtifactRules: z.array(z.string()),
      reviewRoutingRules: z.array(z.string()),
      population: ContentCreationPopulationReportSchema,
    }),
    outputPedagogy: z.object({
      allowedCardTypes: z.array(z.string()),
      allowedActivityTypes: z.array(z.string()),
      difficultyTargetsByConceptRef: z.record(z.string()),
      desiredVariety: z.object({
        minDistinctTypesPerConcept: z.number().int().min(1),
        avoidRepeatingLatestTransformation: z.boolean(),
      }),
      responseExpectations: z.array(
        z.object({
          activityType: z.string().min(1),
          expectedResponseType: z.string().min(1),
          responseSchemaDescription: z.string().min(1),
        })
      ),
      tone: z.string().min(1),
      population: ContentCreationPopulationReportSchema,
    }),
    uncertainties: z.array(
      z.object({
        code: z.string().min(1),
        message: z.string().min(1),
        affectedRefs: z.array(z.string()),
        source: z.enum([
          'prefetch_error',
          'unresolved_ref',
          'missing_tool',
          'partial_data',
          'agent_generated',
        ]),
      })
    ),
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
        })
      ),
      curriculumNodes: z.array(
        z.object({
          nodeRef: z.string().min(1),
          curriculumNodeId: z.string().min(1),
          conceptRef: z.string().nullable(),
        })
      ),
      documents: z.array(z.object({ documentRef: z.string().min(1), documentId: z.string().min(1) })),
      chunks: z.array(
        z.object({
          chunkRef: z.string().min(1),
          chunkId: z.string().nullable(),
          documentRef: z.string().min(1),
        })
      ),
    }),
    requestValues: z.object({
      userId: z.string().min(1),
      correlationId: z.string().nullable(),
      generationJobId: z.string().nullable(),
      agentRunId: z.string().nullable(),
      mode: z.enum(['rag_grounded', 'agent_autonomous']),
      conceptIds: z.array(z.string()),
      documentIds: z.array(z.string()),
      curriculumContext: z.object({
        curriculumId: z.string().nullable(),
        selectedNodeIds: z.array(z.string()),
      }),
      studentContext: z.object({ userId: z.string().min(1) }),
      desiredCardTypes: z.array(z.string()),
      varietyMandate: z.object({ minDistinctTypesPerConcept: z.number().int().min(1) }),
      budget: z.object({ maxCards: z.number().int().min(1), timeoutMs: z.number().int().min(1) }),
    }),
    mappings: z.record(JsonValueSchema),
  }),
  populationReport: z.object({
    deterministicPrefetch: z.array(ContentCreationPopulationEntrySchema),
    staticPolicy: z.array(ContentCreationPopulationEntrySchema),
    callTime: z.array(ContentCreationPopulationEntrySchema),
    llmGeneratedByAgent: z.array(ContentCreationPopulationEntrySchema),
    unavailable: z.array(ContentCreationPopulationEntrySchema),
  }),
  sourceManifest: z.array(ContentCreationPopulationEntrySchema),
});

export type ContentCreationPromptV2Input = z.input<typeof ContentCreationPromptV2Schema>;
