import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CardOriginMode,
  CardReviewState,
  CardState,
  CardType,
  DifficultyLevel,
  EventSource,
  PrismaClient as ContentPrismaClient,
  StudyMode as ContentStudyMode,
  TransformationType as ContentTransformationType,
} from '../services/content-service/generated/prisma/index.js';
import {
  CurriculumEdgeType,
  CurriculumOriginMode,
  CurriculumState,
  CurriculumVersionState,
  PrismaClient as CurriculumPrismaClient,
} from '../services/curriculum-service/generated/prisma/index.js';
import { PrismaClient as IngestionPrismaClient } from '../services/ingestion-service/generated/prisma/index.js';
import { PrismaClient as SessionPrismaClient } from '../services/session-service/generated/prisma/index.js';

const USERS = [
  'user_devuser00000000000000',
  'user_devuser00000000000001',
  'user_devuser00000000000002',
  'user_content_schema_demo_0001',
] as const;

function loadRootEnvFile(): void {
  const scriptDirectory = resolve(fileURLToPath(new URL('.', import.meta.url)));
  const envPath = resolve(scriptDirectory, '..', '.env');
  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/u);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (key === '' || process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = line
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^"(.*)"$/u, '$1')
      .replace(/^'(.*)'$/u, '$1');
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing ${name}.`);
  }
  return value;
}

function curriculumDatabaseUrl(): string {
  const configured = process.env['DATABASE_URL_CURRICULUM'];
  if (typeof configured === 'string' && configured.trim() !== '') {
    return configured;
  }
  return requiredEnv('DATABASE_URL_SESSION').replace(/noema_session(?=$|\?)/u, 'noema_curriculum');
}

function fixtureIds(index: number): {
  cardId: string;
  chunkId: string;
  curriculumId: string;
  documentId: string;
  goalId: string;
  lessonPlanId: string;
  nodeAId: string;
  nodeBId: string;
  sessionId: string;
  stepId: string;
  versionId: string;
} {
  const suffix = String(index);
  return {
    cardId: `card_aw_${suffix}`,
    chunkId: `chunk_aw_${suffix}`,
    curriculumId: `curriculum_aw_${suffix}`,
    documentId: `doc_aw_${suffix}`,
    goalId: `goal_aw_${suffix}`,
    lessonPlanId: `lp_aw_${suffix}`,
    nodeAId: `cnode_aw_${suffix}_stability`,
    nodeBId: `cnode_aw_${suffix}_reasoning`,
    sessionId: `session_aw_${suffix}`,
    stepId: `step_aw_${suffix}`,
    versionId: `cver_aw_${suffix}`,
  };
}

async function seedCurriculum(
  prisma: CurriculumPrismaClient,
  userId: string,
  index: number
): Promise<void> {
  const ids = fixtureIds(index);
  const conceptA = `concept_aw_${index}_stability`;
  const conceptB = `concept_aw_${index}_reasoning`;

  await prisma.curriculum.deleteMany({ where: { id: ids.curriculumId } });
  await prisma.curriculum.create({
    data: {
      id: ids.curriculumId,
      userId,
      title: `Workbench fixture curriculum ${index + 1}`,
      description: 'Mock curriculum used by agent workbench required-field controls.',
      goal: 'Provide stable session, node, and concept references for local agent runs.',
      domain: 'agent-workbench',
      originMode: CurriculumOriginMode.USER_AUTHORED,
      state: CurriculumState.FINALIZED,
      metadata: { fixture: 'agent-workbench' },
      versions: {
        create: {
          id: ids.versionId,
          versionNumber: 1,
          state: CurriculumVersionState.ACTIVE,
          finalizedAt: new Date(),
          nodes: {
            create: [
              {
                id: ids.nodeAId,
                ckgConceptId: conceptA,
                label: 'Stability',
                learningObjective: 'Explain how stability gates the next learning step.',
                stabilityThreshold: 0.8,
                estimatedSessions: 1,
                stableNodeKey: `node_aw_${index}_stability`,
                metadata: { fixture: 'agent-workbench' },
              },
              {
                id: ids.nodeBId,
                ckgConceptId: conceptB,
                label: 'Logical reasoning',
                learningObjective: 'Use evidence to justify a short conclusion.',
                stabilityThreshold: 0.75,
                estimatedSessions: 1,
                stableNodeKey: `node_aw_${index}_reasoning`,
                metadata: { fixture: 'agent-workbench' },
              },
            ],
          },
          edges: {
            create: [
              {
                id: `cedge_aw_${index}`,
                fromNodeId: ids.nodeAId,
                toNodeId: ids.nodeBId,
                type: CurriculumEdgeType.RECOMMENDED_BEFORE,
                rationale: 'Stability context should precede the reasoning exercise.',
                orderingWeight: 1,
              },
            ],
          },
        },
      },
    },
  });
  await prisma.curriculum.update({
    where: { id: ids.curriculumId },
    data: { activeVersionId: ids.versionId },
  });
}

async function seedSession(
  prisma: SessionPrismaClient,
  userId: string,
  index: number
): Promise<void> {
  const ids = fixtureIds(index);
  const conceptA = `concept_aw_${index}_stability`;
  const conceptB = `concept_aw_${index}_reasoning`;
  const now = new Date();

  await prisma.session.deleteMany({ where: { id: ids.sessionId } });
  await prisma.$executeRawUnsafe(
    `
    INSERT INTO sessions (
      id, user_id, curriculum_id, curriculum_version_id, study_mode, learning_mode,
      lifecycle_state, config, stats, started_at, last_activity_at, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5::"StudyMode", $6::learning_mode, $7::session_lifecycle_state,
      $8::jsonb, $9::jsonb, $10, $10, $10, $10)
    `,
    ids.sessionId,
    userId,
    ids.curriculumId,
    ids.versionId,
    'KNOWLEDGE_GAINING',
    'EXPLORATION',
    'PLANNING',
    JSON.stringify({
      topic: 'Agent workbench fixture',
      selectedNodeIds: [ids.nodeAId, ids.nodeBId],
      conceptIds: [conceptA, conceptB],
    }),
    JSON.stringify({ stepsPlanned: 1, stepsPresented: 0, stepsEvaluated: 0, stepsSkipped: 0 }),
    now
  );
  await prisma.$executeRawUnsafe(
    `
    INSERT INTO lesson_plans (
      id, session_id, user_id, curriculum_id, curriculum_version_id, selected_node_ids,
      study_mode, learning_mode, rigor_level, topic, prerequisites, source_decks,
      source_categories, assessment_strategy, adaptation_rules, state, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6::text[], $7::"StudyMode", $8::learning_mode, $9::rigor_level,
      $10, $11::jsonb, $12::jsonb, $13::jsonb, $14, $15, $16::lesson_plan_state, $17, $17)
    `,
    ids.lessonPlanId,
    ids.sessionId,
    userId,
    ids.curriculumId,
    ids.versionId,
    [ids.nodeAId, ids.nodeBId],
    'KNOWLEDGE_GAINING',
    'EXPLORATION',
    'FULL',
    'Agent workbench fixture',
    JSON.stringify([]),
    JSON.stringify([]),
    JSON.stringify([]),
    'Use the seeded step as a lightweight diagnostic anchor.',
    'Allow repair recommendations without mutating production content.',
    'ACTIVE',
    now
  );
  await prisma.$executeRawUnsafe(
    `
    INSERT INTO lesson_plan_goals (
      id, lesson_plan_id, description, type, state, source, concept_refs, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4::goal_type, $5::goal_state, $6::goal_source, $7::text[], $8, $8)
    `,
    ids.goalId,
    ids.lessonPlanId,
    'Explain stability and reasoning from a short source.',
    'ACQUISITION',
    'ACTIVE',
    'SYSTEM_PROPOSED',
    [conceptA, conceptB],
    now
  );
  await prisma.$executeRawUnsafe(
    `
    INSERT INTO steps (
      id, lesson_plan_id, session_id, user_id, study_mode, position, objective,
      serves_goal_ids, eligible_modes, selected_mode, transformation_type, expected_outcome,
      evaluation_type, difficulty, concept_refs, variant_seed, status, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5::"StudyMode", $6, $7, $8::text[], $9::text[], $10,
      $11::transformation_type, $12, $13, $14, $15::text[], $16, $17::step_status, $18, $18)
    `,
    ids.stepId,
    ids.lessonPlanId,
    ids.sessionId,
    userId,
    'KNOWLEDGE_GAINING',
    1,
    'Connect stability evidence to a reasoning decision.',
    [ids.goalId],
    ['explanation'],
    'explanation',
    'EXPLANATION',
    'A concise explanation grounded in the fixture document.',
    'short_answer',
    0.42,
    [conceptA, conceptB],
    `agent-workbench-${index}`,
    'PLANNED',
    now
  );
  await prisma.$executeRawUnsafe(
    `
    INSERT INTO activities (
      id, step_id, position, content_source_type, card_id, prompt, render_payload,
      expected_response_type, response_schema, variant_seed
    )
    VALUES ($1, $2, $3, $4::activity_content_source_type, $5, $6, $7::jsonb, $8, $9::jsonb, $10)
    `,
    `activity_aw_${index}`,
    ids.stepId,
    1,
    'CARD',
    ids.cardId,
    'Explain why stability evidence matters before advancing.',
    JSON.stringify({ cardId: ids.cardId, conceptIds: [conceptA, conceptB] }),
    'short_text',
    JSON.stringify({ type: 'object', required: ['answer'] }),
    `activity-agent-workbench-${index}`
  );
  await prisma.$executeRawUnsafe(
    `
    INSERT INTO step_queue_items (
      id, session_id, step_id, position, status, injected_by, reason, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5::step_queue_status, $6, $7, $8, $8)
    `,
    `queue_aw_${index}`,
    ids.sessionId,
    ids.stepId,
    1,
    'PENDING',
    'seed-agent-workbench-fixtures',
    'Local agent workbench required-field fixture.',
    now
  );
}

async function seedContent(
  prisma: ContentPrismaClient,
  userId: string,
  index: number
): Promise<void> {
  const ids = fixtureIds(index);
  const conceptA = `concept_aw_${index}_stability`;
  const conceptB = `concept_aw_${index}_reasoning`;

  await prisma.card.deleteMany({ where: { id: ids.cardId } });
  await prisma.card.create({
    data: {
      id: ids.cardId,
      userId,
      cardType: CardType.DEFINITION,
      state: CardState.ACTIVE,
      difficulty: DifficultyLevel.INTERMEDIATE,
      content: {
        front: 'What does stability mean in the workbench fixture?',
        back: 'Stability means the learner has enough reliable evidence to advance without immediate repair.',
      },
      knowledgeNodeIds: [conceptA, conceptB],
      anchoredCkgNodeIds: [conceptA],
      anchoredPkgNodeIds: [conceptB],
      compatibleTransformations: [
        ContentTransformationType.RECALL,
        ContentTransformationType.EXPLANATION,
      ],
      defaultEligibilityGroups: ['agent-workbench'],
      supportedStudyModes: [ContentStudyMode.KNOWLEDGE_GAINING],
      tags: ['agent-workbench', 'fixture'],
      source: EventSource.SYSTEM,
      originMode: CardOriginMode.AUTHORED,
      authorUserId: userId,
      sourceDocumentIds: [ids.documentId],
      sources: [{ documentId: ids.documentId, chunkId: ids.chunkId }],
      factualityScore: 0.95,
      reviewState: CardReviewState.ACTIVE,
      metadata: { fixture: 'agent-workbench' },
      createdBy: userId,
      updatedBy: userId,
    },
  });
}

async function seedIngestion(
  prisma: IngestionPrismaClient,
  userId: string,
  index: number
): Promise<void> {
  const ids = fixtureIds(index);
  const conceptA = `concept_aw_${index}_stability`;

  await prisma.ingestionDocument.deleteMany({ where: { id: ids.documentId } });
  await prisma.ingestionDocument.create({
    data: {
      id: ids.documentId,
      userId,
      title: `Workbench source document ${index + 1}`,
      sourceKind: 'mock',
      mimeKind: 'text/plain',
      sourceUri: `mock://agent-workbench/${index}`,
      checksum: `agent-workbench-${index}`,
      byteLength: 160,
      rawContent:
        'Stability evidence helps decide whether the learner should advance, pause, or repair a prerequisite concept.',
      metadata: { fixture: 'agent-workbench' },
      ir: {
        create: {
          language: 'en',
          title: `Workbench source document ${index + 1}`,
          outline: [
            { id: `block_aw_${index}_heading`, kind: 'heading', text: 'Stability evidence' },
          ],
          blocks: [
            { id: `block_aw_${index}_heading`, kind: 'heading', text: 'Stability evidence' },
            {
              id: `block_aw_${index}_body`,
              kind: 'paragraph',
              text: 'Stability evidence helps decide whether to advance, pause, or repair.',
            },
          ],
          metadata: { fixture: 'agent-workbench' },
        },
      },
      chunks: {
        create: {
          id: ids.chunkId,
          userId,
          ordinal: 0,
          text: 'Stability evidence helps decide whether to advance, pause, or repair.',
          tokenEstimate: 12,
          headingPath: ['Stability evidence'],
          metadata: { fixture: 'agent-workbench' },
        },
      },
      candidates: {
        create: {
          id: `cand_aw_${index}`,
          userId,
          label: 'Stability',
          definition: 'Evidence that the learner can advance without immediate repair.',
          salience: 0.9,
          evidenceChunkIds: [ids.chunkId],
          state: 'mapped',
          ckgNodeId: conceptA,
          metadata: { fixture: 'agent-workbench' },
        },
      },
    },
  });
}

async function main(): Promise<void> {
  loadRootEnvFile();

  const content = new ContentPrismaClient({
    datasources: { db: { url: requiredEnv('DATABASE_URL_CONTENT') } },
  });
  const curriculum = new CurriculumPrismaClient({
    datasources: { db: { url: curriculumDatabaseUrl() } },
  });
  const ingestion = new IngestionPrismaClient({
    datasources: { db: { url: requiredEnv('DATABASE_URL_INGESTION') } },
  });
  const session = new SessionPrismaClient({
    datasources: { db: { url: requiredEnv('DATABASE_URL_SESSION') } },
  });

  try {
    for (const [index, userId] of USERS.entries()) {
      await seedCurriculum(curriculum, userId, index);
      await seedIngestion(ingestion, userId, index);
      await seedContent(content, userId, index);
      await seedSession(session, userId, index);
    }

    console.log(
      JSON.stringify(
        {
          seededUsers: USERS,
          fixtures: USERS.map((_userId, index) => fixtureIds(index)),
        },
        null,
        2
      )
    );
  } finally {
    await Promise.all([
      content.$disconnect(),
      curriculum.$disconnect(),
      ingestion.$disconnect(),
      session.$disconnect(),
    ]);
  }
}

void main();
