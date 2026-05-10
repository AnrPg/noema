# Content Creation Prompt Readiness Refactor
# PHASE 1

## Summary
Refactor content creation into a hard-gated orchestration pipeline that guarantees `ContentCreationPromptV2` is fully populated before `content-creator-agent` runs. Because the app is unreleased, remove all content-generation aliases and replace partial compatibility paths with canonical contracts, deterministic preflight checks, and agent-finalized prerequisites.

## Key Changes
- Introduce `ContentCreationPromptV2` as a shared validation contract in `packages/validation`, with strict schemas for prompt input, population entries, identity maps, source manifest, and orchestration status.
- Replace `get-content-creator-brief` output with a `ContentCreationPromptV2` object; keep raw service sections only inside `sourceManifest`/debug metadata, not as the primary prompt shape.
- Delete `content-generation-agent`, `content_generation`, `get-content-generation-brief`, and the Python compatibility shim everywhere, following ADR-011 no-alias policy.
- Add a `ContentCreationPromptBuilder` in the agent runtime that maps service/tool results into the V2 schema and fails closed if required preflight artifacts are missing.
- Add `content-creation-orchestrator` as the only entrypoint for content creation. It runs preflight agents, verifies their outputs are persisted/finalized, rebuilds the prompt, then calls `content-creator-agent`.

## Preflight Agent Workflow
- `content-intent-normalizer-agent`: normalizes trigger, purpose, pedagogical move, artifact scope, source policy, personalization policy, and budget from caller input plus deterministic service signals.
- `knowledge-graph-agent`: upgrade from proposal-only to content-readiness mode. It must ensure all target concepts, prerequisite edges, related concepts, contrasts, confusables, and misconception links exist as persisted graph nodes/edges before content creation proceeds.
- `learner-state-summarizer-agent`: normalizes explicit learner check-ins, cognitive load/fatigue/motivation signals, reasoning averages, calibration data, recent failure modes, and repair recommendations. It must not infer mood without an explicit source; absent mood is populated as `null` with a deterministic population entry.
- `content-pedagogy-planner-agent`: fills pedagogical fields that cannot be derived from scheduler/content coverage alone, especially difficulty targets and desired variety, then marks those fields as `llm_generated_by_agent`.
- `pedagogy-guardian` remains the validation gate for generated cards/activity variants, and also validates preflight agent outputs that affect learner-facing prompt context.

## Backend Readiness Work
- Knowledge graph service:
  - Add relation-specific read/write tools for `contrasts_with`, `confusable_with`, prerequisite, related, and misconception links.
  - Add an `ensure-content-readiness-subgraph` tool that creates or reuses required nodes/edges and returns final IDs, labels, aliases, descriptions, relation packs, and unresolved failures.
- Content service:
  - Add list/query APIs and MCP tools for generated activity variants by concept, study mode, transformation type, and difficulty.
  - Extend coverage output to include readable existing cards, readable generated variants, missing card/activity types, duplicate risks, and coverage summary.
- Scheduler/metacognition:
  - Add concept-indexed calibration projection and remediation brief tools.
  - Ensure scheduler exposes concept schedule state and transformation history in prompt-ready shapes.
- User/session layer:
  - Add an explicit check-in/read surface for mood/load/fatigue/motivation, or document that these fields are nullable and populated as `null` unless explicitly provided.
- Ingestion/vector:
  - Ensure document context and chunk retrieval return stable `documentRef`, `chunkRef`, citations, excerpts, locators, and confidence.

## Orchestration Rules
- `content-creator-agent` is never called directly by services or UI; all calls go through `content-creation-orchestrator`.
- The orchestrator blocks if graph readiness has unresolved concepts, missing node IDs, missing prerequisite/confusable/contrast relation packs, or unpersisted KG mutations.
- The orchestrator blocks if required RAG evidence is absent for `rag_required`.
- Agent-generated fields must include `agentRunId`, `agentName`, source input, status, and final persisted artifact references in `populationReport`.
- Nullable fields are still considered populated when the builder deterministically sets `null` and records why.
- Machine IDs are copied only from `serviceContract.identityMap`; pedagogical reasoning uses only `pedagogicalContext`.

## API And UI Changes
- Content-service `HttpContentAgentClient` calls only `content-creation-orchestrator`, never agent aliases.
- Agent runtime exposes wrappers for `content-creation-orchestrator`, `content-creator-agent`, `content-intent-normalizer-agent`, `learner-state-summarizer-agent`, and `content-pedagogy-planner-agent`; only the orchestrator is public for creation requests.
- Admin/workbench views render prompt sections in this order: pedagogical context, service contract, population report, source manifest, raw debug.
- Batch worker accepts only orchestrator-owned content creation jobs and rejects raw `content-creator-agent` draft jobs unless they are internal finalized subjobs.

## Tests And Acceptance
- Golden scenario `user_content_schema_demo_0001` for Bayes theorem must populate every V2 field, with empty `unavailable` and empty `uncertainties`.
- Tests assert `content-creator-agent` is not invoked until graph readiness, learner state normalization, intent normalization, and pedagogy planning are finalized.
- Tests assert missing Bayes graph nodes/edges are created before prompt assembly, including prerequisite, related, contrast, confusable, and misconception links.
- Tests cover `rag_required`, `rag_allowed`, and `autonomous_allowed` source policies.
- Grep tests assert no production references to `content-generation-agent`, `content_generation`, `get-content-generation-brief`, or `ContentGenerationAgent`.
- Contract tests validate `ContentCreationPromptV2` against shared schemas in agent runtime, content service, API clients, and frontend fixtures.
- End-to-end test creates a content job from ingestion/curriculum/manual request and verifies the final imported cards/activity variants map IDs only through `serviceContract.identityMap`.

## Assumptions
- Since the app is unreleased, breaking compatibility is required and no aliases are retained.
- KG content-readiness mutations may be automatically persisted after deterministic validation and Guardian/policy approval; human review is reserved for low-confidence or policy-blocked graph changes.
- Explicit learner affect is optional; absence is represented by `null`, not by LLM inference.
- The content creator remains tool-free during final generation; all tool use happens before prompt construction.





---

# PHASE 2


# Full Content-Creator Schema Refactor, Revised

## Summary

Refactor content creation around one canonical `content-creator-agent`. Remove the `content-generation-agent` alias and replace the prompt contract with `ContentCreationPromptV2`.

The LLM reasons only from human-readable pedagogical context. IDs and downstream function/schema mappings live in `serviceContract` and are copied into output, not used as semantic input.

## Canonical Schema

```ts
type ContentCreationPromptV2 = {
  schemaVersion: "content_creation_prompt.v2";

  instructions: {
    reasoningRule: "Use pedagogicalContext for reasoning. Use serviceContract only for IDs, schema compliance, and downstream handoff.";
  };

  pedagogicalContext: {
    generationIntent: {
      trigger:
        | "curriculum_gap"
        | "source_ingestion"
        | "learner_repair"
        | "frontier_progression"
        | "practice_variety"
        | "transformation"
        | "graph_gap"
        | "manual_author_request";
      purpose: string;
      pedagogicalMove:
        | "introduce"
        | "reinforce"
        | "repair"
        | "contrast"
        | "discriminate"
        | "apply"
        | "transfer"
        | "calibrate"
        | "assess";
      artifactScope: "cards" | "activity_variants" | "cards_and_activity_variants";
      sourcePolicy: "rag_required" | "rag_allowed" | "autonomous_allowed";
      personalizationPolicy: "none" | "concept_state" | "learner_state" | "full_personalization";
      population: PopulationReport;
    };

    targetConcepts: Array<{
      conceptRef: string; // local ref, e.g. "c1"; no machine ID
      label: string;
      description: string | null;
      domain: string | null;
      studyMode: "knowledge_gaining" | "language_learning";
      aliases: string[];
      learnerFacingSummary: string | null;
      population: PopulationReport;
    }>;

    conceptRelations: {
      prerequisitesByConceptRef: Record<string, RelationPack>;
      relatedConceptsByConceptRef: Record<string, RelationPack>;
      contrastsByConceptRef: Record<string, RelationPack>;
      confusablesByConceptRef: Record<string, RelationPack>;
      misconceptionLinksByConceptRef: Record<string, RelationPack>;
    };

    learnerState: {
      global: {
        displayName: string | null;
        preferredLanguage: string | null;
        currentMood: MoodSignal | null;
        cognitiveLoad: LoadSignal | null;
        fatigue: LoadSignal | null;
        motivation: MoodSignal | null;
        population: PopulationReport;
      };
      byConceptRef: Record<string, {
        scheduleState: unknown | null;
        stabilityLabel: string | null;
        reasoningAverage: unknown | null;
        confidenceCalibration: unknown | null;
        recentFailureModes: unknown[];
        misconceptionSignals: unknown[];
        recommendedRepairMove: string | null;
        difficultyRecommendation: string | null;
        population: PopulationReport;
      }>;
    };

    curriculumContext: {
      curriculumTitle: string | null;
      activeVersionLabel: string | null;
      selectedNodes: Array<{
        nodeRef: string;
        label: string;
        role: string | null;
      }>;
      frontierNodes: Array<{
        nodeRef: string;
        label: string;
        readinessReason: string | null;
      }>;
      nearbyCurriculumNodes: Array<{
        nodeRef: string;
        label: string;
        relationshipToTarget: string;
      }>;
      population: PopulationReport;
    };

    contentCoverageContext: {
      byConceptRef: Record<string, {
        existingCards: Array<ReadableExistingCard>;
        existingActivityVariants: Array<ReadableExistingActivityVariant>;
        coverageSummary: string | null;
        missingCardTypes: string[];
        missingActivityTypes: string[];
        duplicateRisks: string[];
        population: PopulationReport;
      }>;
    };

    ragContext: {
      sourcePolicy: "required" | "allowed" | "not_used";
      documents: Array<{
        documentRef: string;
        title: string;
        outline: unknown | null;
        sourceKind: string | null;
      }>;
      evidenceByConceptRef: Record<string, Array<{
        documentRef: string;
        chunkRef: string;
        excerpt: string;
        locator: string | null;
        citationLabel: string;
        confidence: number | null;
      }>>;
      citationRules: string[];
      unsupportedClaimPolicy: "reject" | "mark_uncertain";
      population: PopulationReport;
    };

    guardianPolicy: {
      learnerSafetyRules: string[];
      factualityRules: string[];
      answerLeakageRules: string[];
      malformedArtifactRules: string[];
      reviewRoutingRules: string[];
      population: PopulationReport;
    };

    outputPedagogy: {
      allowedCardTypes: string[];
      allowedActivityTypes: string[];
      difficultyTargetsByConceptRef: Record<string, string>;
      desiredVariety: {
        minDistinctTypesPerConcept: number;
        avoidRepeatingLatestTransformation: boolean;
      };
      responseExpectations: Array<{
        activityType: string;
        expectedResponseType: string;
        responseSchemaDescription: string;
      }>;
      tone: string;
      population: PopulationReport;
    };

    uncertainties: Array<{
      code: string;
      message: string;
      affectedRefs: string[];
      source: "prefetch_error" | "unresolved_ref" | "missing_tool" | "partial_data" | "agent_generated";
    }>;
  };

  serviceContract: {
    identityMap: {
      concepts: Array<{
        conceptRef: string;
        inputRef: string;
        conceptId: string | null;
        pkgNodeId: string | null;
        selectedNodeIds: string[];
      }>;
      curriculumNodes: Array<{
        nodeRef: string;
        curriculumNodeId: string;
        conceptRef: string | null;
      }>;
      documents: Array<{
        documentRef: string;
        documentId: string;
      }>;
      chunks: Array<{
        chunkRef: string;
        chunkId: string | null;
        documentRef: string;
      }>;
    };

    requestValues: {
      userId: string;
      correlationId: string | null;
      generationJobId: string | null;
      agentRunId: string | null;
      mode: "rag_grounded" | "agent_autonomous";
      conceptIds: string[];
      documentIds: string[];
      curriculumContext: {
        curriculumId: string | null;
        selectedNodeIds: string[];
      };
      studentContext: {
        userId: string;
      };
      desiredCardTypes: string[];
      varietyMandate: {
        minDistinctTypesPerConcept: number;
      };
      budget: {
        maxCards: number;
        timeoutMs: number;
      };
    };

    mappings: {
      requestMapsTo: {
        mode: "CreateContentGenerationJobInputSchema.mode";
        conceptIds: "CreateContentGenerationJobInputSchema.conceptIds";
        documentIds: "CreateContentGenerationJobInputSchema.documentIds";
        curriculumContext: "CreateContentGenerationJobInputSchema.curriculumContext";
        studentContext: "CreateContentGenerationJobInputSchema.studentContext";
        desiredCardTypes: "CreateContentGenerationJobInputSchema.desiredCardTypes";
        varietyMandate: "CreateContentGenerationJobInputSchema.varietyMandate";
        budget: "CreateContentGenerationJobInputSchema.budget";
      };

      cardOutputMapsTo: {
        cardType: "CreateCardInputSchema.cardType";
        content: "CreateCardInputSchema.content";
        difficulty: "CreateCardInputSchema.difficulty";
        tags: "CreateCardInputSchema.tags";
        supportedStudyModes: "CreateCardInputSchema.supportedStudyModes";
        source: "CreateCardInputSchema.source";
        originMode: "CreateCardInputSchema.originMode";
        anchoredCkgNodeIds: "CreateCardInputSchema.anchoredCkgNodeIds";
        anchoredPkgNodeIds: "CreateCardInputSchema.anchoredPkgNodeIds";
        knowledgeNodeIds: "CreateCardInputSchema.knowledgeNodeIds";
        sourceDocumentIds: "CreateCardInputSchema.sourceDocumentIds";
        sources: "CreateCardInputSchema.sources";
        factualityScore: "CreateCardInputSchema.factualityScore";
        reviewState: "CreateCardInputSchema.reviewState";
        guardianValidationId: "CreateCardInputSchema.guardianValidationId";
        rationale: "CreateCardInputSchema.metadata.generationRationale";
      };

      activityVariantOutputMapsTo: {
        conceptId: "CreateGeneratedActivityVariantInputSchema.conceptId";
        studyMode: "CreateGeneratedActivityVariantInputSchema.studyMode";
        transformationType: "CreateGeneratedActivityVariantInputSchema.transformationType";
        epistemicMode: "CreateGeneratedActivityVariantInputSchema.epistemicMode";
        difficultyBucket: "CreateGeneratedActivityVariantInputSchema.difficultyBucket";
        sourceCardIds: "CreateGeneratedActivityVariantInputSchema.sourceCardIds";
        prompt: "CreateGeneratedActivityVariantInputSchema.prompt";
        renderPayload: "CreateGeneratedActivityVariantInputSchema.renderPayload";
        expectedResponseType: "CreateGeneratedActivityVariantInputSchema.expectedResponseType";
        responseSchema: "CreateGeneratedActivityVariantInputSchema.responseSchema";
        variantSeed: "CreateGeneratedActivityVariantInputSchema.variantSeed";
        generatorMetadata: "CreateGeneratedActivityVariantInputSchema.generatorMetadata";
        ttlAt: "CreateGeneratedActivityVariantInputSchema.ttlAt";
      };

      importMapsTo: "ImportGeneratedContentBatchInputSchema";
      guardianValidationMapsTo: "pedagogy-guardian.validate-generated-variant";
    };
  };

  populationReport: {
    deterministicPrefetch: PopulationEntry[];
    staticPolicy: PopulationEntry[];
    callTime: PopulationEntry[];
    llmGeneratedByAgent: PopulationEntry[];
    unavailable: PopulationEntry[];
  };

  sourceManifest: PopulationEntry[];
};

type PopulationReport = {
  mode:
    | "deterministic_prefetch"
    | "static_policy"
    | "call_time"
    | "llm_generated_by_agent"
    | "unavailable";
  source: string;
  notes?: string;
};

type PopulationEntry = {
  fieldPath: string;
  mode: PopulationReport["mode"];
  source: string;
  toolOrFunction?: string;
  agentName?: string;
  input?: unknown;
  status: "populated" | "empty" | "unavailable" | "error";
  error?: unknown;
};

type RelationPack = {
  items: Array<{
    label: string;
    relationship: string;
    explanation: string | null;
  }>;
  population: PopulationReport;
};

type MoodSignal = {
  label: string;
  confidence: number | null;
  source: string;
};

type LoadSignal = {
  label: "low" | "medium" | "high" | "unknown";
  evidence: string[];
};

type ReadableExistingCard = {
  cardRef: string;
  cardType: string;
  front: string;
  backSummary: string;
  difficulty: string;
  tags: string[];
};

type ReadableExistingActivityVariant = {
  variantRef: string;
  prompt: string;
  transformationType: string;
  difficultyBucket: number;
};
```

## Population Report

Fields that should be **deterministically pre-fetched**:

- `targetConcepts.*` from KG resolver and node tools.
- `conceptRelations.*` from KG prerequisite, related-concepts, and misconception tools.
- `learnerState.byConceptRef.scheduleState` from scheduler.
- `learnerState.byConceptRef.reasoningAverage`, `recentFailureModes`, and calibration fields from metacognition tools.
- `curriculumContext.*` from curriculum service.
- `contentCoverageContext.*` from content service.
- `ragContext.documents` from ingestion service.
- `ragContext.evidenceByConceptRef` and `citations` from vector/ingestion chunk metadata.
- `serviceContract.identityMap` from call-time values plus deterministic resolver outputs.

Fields that are **static policy**:

- `guardianPolicy.*`
- `outputPedagogy.responseExpectations`
- service schema mappings
- review-state defaults

Fields that are **call-time**:

- requested trigger/purpose when supplied by caller
- `desiredCardTypes`
- `desiredActivityTypes`
- `varietyMandate`
- `budget`
- `studyMode`
- `mode`
- `documentIds`
- selected curriculum nodes

Fields that may be **generated by another agent**:

- `generationIntent.reason` if caller gives no reason and no deterministic gap/remediation signal exists.
  - Agent: `content-intent-classifier` or future uniform `intent-normalizer-agent`.
- `learnerState.global.currentMood` if no deterministic mood check-in exists.
  - Agent: should not infer from behavior silently; use future `learner-state-summarizer-agent` only if explicit mood source exists.
- `targetConcepts[].learnerFacingSummary` if KG has no description.
  - Agent: `knowledge-graph-agent` should propose/curate this, not content creator.
- `outputPedagogy.difficultyTargetsByConceptRef` if scheduler/reasoning are missing.
  - Agent: content creator may propose, but must mark as `llm_generated_by_agent`.

Fields that are currently **unavailable or partial** and need backend work:

- generated activity variant list/query.
- calibration data tool.
- concept-indexed remediation brief if only session-level data exists.
- explicit mood/current affect source.
- relation-filtered contrasts/confusables if KG relations do not distinguish them cleanly.

## Implementation Changes

- Remove all alias code and references:
  - `content-generation-agent`
  - `content_generation` execution mode
  - `get-content-generation-brief`
  - `ContentGenerationAgent`
  - `agents/src/agents/content_generator.py`
- Refactor content context assembly into a dedicated `ContentCreationPromptBuilder`.
- Make `get-content-creator-brief` return `ContentCreationPromptV2` as primary output.
- Update the LLM prompt renderer to pass the v2 schema as the content creator’s canonical prompt input.
- Update content finalization to treat `serviceContract.identityMap` as the only source for machine IDs.
- Update content-service `HttpContentAgentClient` to call only `content-creator-agent`.
- Update Batch worker to accept only `content-creator-agent` for content drafts.
- Add missing backend read surfaces required for full mock population:
  - generated variant query/list in content-service.
  - metacognitive calibration read surface.
  - deterministic mood/check-in source if one exists; otherwise mark mood unavailable in normal runs and populate it only in seeded test data.
- Update frontend workbench and admin run views to render:
  - readable pedagogical context first
  - service contract second
  - population report third
  - raw source manifest last

## Mock Data And Verification

Seed user:

`user_content_schema_demo_0001`

Golden mock scenario:

- Target: `Bayes theorem`
- Prerequisite: `Conditional probability`
- Related concept: `Base rates`
- Contrast/confusable: `Likelihood vs posterior`
- Misconception: confusing likelihood with posterior
- Mood: `focused`
- Cognitive load: `medium`
- Metacognitive state: overconfident but improving reasoning trace
- Curriculum: active statistics curriculum with selected node and frontier
- Source document: seeded Bayes theorem document with outline, chunks, and citations
- Existing content: at least one existing card and one generated activity variant
- Scheduler: concept schedule populated
- Metacognition: reasoning average, remediation brief, calibration signal populated
- Guardian policy: all rules populated

Acceptance test:

- Run content creator context assembly for `user_content_schema_demo_0001`.
- Assert every schema field is populated.
- Assert `populationReport.unavailable` is empty.
- Assert `uncertainties[]` is empty.
- Assert prompt contains `ContentCreationPromptV2`.
- Assert no `content-generation-agent` appears in wrappers, API tests, frontend, docs, or Batch worker paths.

## Tests

- Agent runtime tests for wrapper removal and v2 prompt shape.
- Composite tool tests for complete deterministic population.
- Batch worker tests for content creator only.
- Content-service tests for generated variant query/list and updated content-agent client.
- API client tests removing alias calls.
- Frontend tests or typechecks for workbench/admin run rendering.
- Docs checks for renamed canonical agent docs.

## Assumptions

- The content creator never uses IDs for semantic reasoning; IDs are copied only through `serviceContract`.
- The LLM does not call tools during content creation.
- Any field not deterministically populated must be marked explicitly in `populationReport`; the golden mock test must have no unavailable fields.
- Breaking compatibility is desired and required.
