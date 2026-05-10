/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/no-unnecessary-condition */
import type {
  ICurriculum,
  ICurriculumProgress,
  ICurriculumRevisionProposal,
  ICreateCurriculumInput,
  IRealignmentEvidence,
} from '@noema/contracts';
import { CurriculumOriginMode, CurriculumState, ID_PREFIXES, RevisionChangeState } from '@noema/types';
import type {
  CurriculumId,
  CurriculumNodeRuntimeState,
  CurriculumVersionId,
  RevisionChangeId,
  RevisionProposalId,
  SessionId,
  UserId,
} from '@noema/types';
import type { Prisma } from '@prisma/client';
import { nanoid } from 'nanoid';
import type { CurriculumRepository } from '../../domain/curriculum-service/curriculum.repository.js';
import type { CurriculumVersionGraph } from '../../domain/curriculum-service/curriculum.types.js';

interface PrismaLike {
  curriculum: {
    findMany(args: unknown): Promise<unknown[]>;
    create(args: unknown): Promise<unknown>;
    findFirst(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
  };
  curriculumVersion: {
    findFirst(args: unknown): Promise<unknown>;
    create(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<unknown>;
  };
  curriculumProgress: {
    findMany(args: unknown): Promise<unknown[]>;
    upsert(args: unknown): Promise<unknown>;
  };
  curriculumRevisionProposal: {
    findMany(args: unknown): Promise<unknown[]>;
    findFirst(args: unknown): Promise<unknown>;
    create(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
  };
  revisionChange: {
    update(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<unknown>;
  };
  realignmentEvidence: {
    findMany(args: unknown): Promise<unknown[]>;
    upsert(args: unknown): Promise<unknown>;
  };
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $transaction<T>(fn: (tx: PrismaLike) => Promise<T>): Promise<T>;
}

export class PrismaCurriculumRepository implements CurriculumRepository {
  constructor(private readonly prisma: PrismaLike) {}

  private db(tx?: PrismaLike): PrismaLike {
    return tx ?? this.prisma;
  }

  async listByUser(userId: UserId, includeHidden = false): Promise<ICurriculum[]> {
    const rows = await this.prisma.curriculum.findMany({
      where: {
        userId,
        state: { not: 'ARCHIVED' },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(mapCurriculum).filter((curriculum) => {
      return includeHidden || curriculum.metadata.hiddenFromVault !== true;
    });
  }

  async create(
    userId: UserId,
    input: ICreateCurriculumInput,
    tx?: Prisma.TransactionClient
  ): Promise<ICurriculum> {
    const row = await this.db(tx as unknown as PrismaLike).curriculum.create({
      data: {
        id: `curr_${nanoid(21)}`,
        userId,
        title: input.title,
        description: input.description,
        goal: input.goal,
        domain: input.domain,
        originMode: toDbEnum(input.originMode ?? CurriculumOriginMode.USER_AUTHORED),
        state: 'DRAFT',
        metadata: {},
      },
    });
    return mapCurriculum(row);
  }

  async getById(userId: UserId, curriculumId: CurriculumId): Promise<ICurriculum | undefined> {
    const row = await this.prisma.curriculum.findFirst({
      where: { id: curriculumId, userId },
      include: {
        versions: {
          where: { state: 'ACTIVE' },
          include: { nodes: true, edges: true },
          take: 1,
        },
      },
    });
    return row === null ? undefined : mapCurriculum(row);
  }

  async getActiveVersion(curriculumId: CurriculumId): Promise<CurriculumVersionGraph | undefined> {
    const row = await this.prisma.curriculumVersion.findFirst({
      where: { curriculumId, state: 'ACTIVE' },
      include: { nodes: true, edges: true },
      orderBy: { versionNumber: 'desc' },
    });
    if (row === null) return undefined;
    return mapVersionGraph(row);
  }

  async getActiveVersionForUser(
    userId: UserId,
    curriculumId: CurriculumId
  ): Promise<CurriculumVersionGraph | undefined> {
    const curriculum = await this.getById(userId, curriculumId);
    if (curriculum === undefined) return undefined;
    return this.getActiveVersion(curriculumId);
  }

  async listProgress(
    userId: UserId,
    curriculumId: CurriculumId,
    tx?: Prisma.TransactionClient
  ): Promise<ICurriculumProgress[]> {
    const rows = await this.db(tx as unknown as PrismaLike).curriculumProgress.findMany({
      where: { userId, curriculumId },
      orderBy: { stableNodeKey: 'asc' },
    });
    return rows.map(mapProgress);
  }

  async upsertProgress(input: {
    userId: UserId;
    curriculumId: CurriculumId;
    stableNodeKey: string;
    runtimeState: CurriculumNodeRuntimeState;
    sessionId: SessionId;
    evaluationCount: number;
    correctStreak: number;
    stabilitySnapshot?: number;
    completedAt?: Date | string;
  }, tx?: Prisma.TransactionClient): Promise<ICurriculumProgress> {
    const row = await this.db(tx as unknown as PrismaLike).curriculumProgress.upsert({
      where: {
        curriculumId_userId_stableNodeKey: {
          curriculumId: input.curriculumId,
          userId: input.userId,
          stableNodeKey: input.stableNodeKey,
        },
      },
      create: {
        id: `cprog_${nanoid(21)}`,
        curriculumId: input.curriculumId,
        userId: input.userId,
        stableNodeKey: input.stableNodeKey,
        runtimeState: toDbEnum(input.runtimeState),
        firstTouchedAt: new Date(),
        completedAt: input.completedAt === undefined ? null : new Date(input.completedAt),
        lastSessionId: input.sessionId,
        evaluationCount: input.evaluationCount,
        correctStreak: input.correctStreak,
        stabilitySnapshot: input.stabilitySnapshot,
      },
      update: {
        runtimeState: toDbEnum(input.runtimeState),
        completedAt: input.completedAt === undefined ? null : new Date(input.completedAt),
        lastSessionId: input.sessionId,
        evaluationCount: input.evaluationCount,
        correctStreak: input.correctStreak,
        stabilitySnapshot: input.stabilitySnapshot,
      },
    });
    return mapProgress(row);
  }

  async markEvaluationEventProcessed(input: {
    userId: UserId;
    curriculumId: CurriculumId;
    stableNodeKey: string;
    evaluationId: string;
    sourceEventId?: string;
    sessionId: SessionId;
  }, tx?: Prisma.TransactionClient): Promise<boolean> {
    const db = this.db(tx as unknown as PrismaLike);
    const rows = await db.$queryRawUnsafe<unknown[]>(
      `INSERT INTO "curriculum_progress_evaluation_events" (
         "id",
         "curriculum_id",
         "user_id",
         "stable_node_key",
         "evaluation_id",
         "source_event_id",
         "session_id"
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT ("curriculum_id", "user_id", "stable_node_key", "evaluation_id")
       DO NOTHING
       RETURNING "id"`,
      `cpevt_${nanoid(21)}`,
      input.curriculumId,
      input.userId,
      input.stableNodeKey,
      input.evaluationId,
      input.sourceEventId ?? null,
      input.sessionId
    );
    return rows.length > 0;
  }

  async saveDraftVersion(input: {
    curriculumId: CurriculumId;
    parentVersionId?: CurriculumVersionId;
    graph: CurriculumVersionGraph;
    agentRunId?: string;
  }, tx?: Prisma.TransactionClient): Promise<CurriculumVersionId> {
    const id = input.graph.id;
    const db = this.db(tx as unknown as PrismaLike);
    const latest = await db.curriculumVersion.findFirst({
      where: { curriculumId: input.curriculumId },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    });
    const versionNumber =
      typeof (latest as { versionNumber?: unknown } | null)?.versionNumber === 'number'
        ? ((latest as { versionNumber: number }).versionNumber + 1)
        : 1;
    await db.curriculumVersion.create({
      data: {
        id,
        curriculumId: input.curriculumId,
        versionNumber,
        state: 'DRAFT',
        parentVersionId: input.parentVersionId,
        agentRunId: input.agentRunId,
        nodes: {
          create: input.graph.nodes.map((node) => ({
            id: node.id,
            ckgConceptId: node.ckgConceptId,
            proposedConcept: node.proposedConcept,
            label: node.label,
            learningObjective: node.learningObjective,
            stabilityThreshold: node.stabilityThreshold,
            estimatedSessions: node.estimatedSessions,
            traversalWeight: node.traversalWeight,
            metadata: node.metadata ?? {},
            stableNodeKey: node.stableNodeKey,
          })),
        },
        edges: {
          create: input.graph.edges.map((edge) => ({
            id: edge.id,
            fromNodeId: edge.fromNodeId,
            toNodeId: edge.toNodeId,
            type: toDbEnum(edge.type),
            rationale: edge.rationale,
            orderingWeight: edge.orderingWeight,
          })),
        },
      },
    });
    return id;
  }

  async finalizeVersion(input: {
    userId: UserId;
    curriculumId: CurriculumId;
    curriculumVersionId: CurriculumVersionId;
    guardianValidationId: string;
  }, tx?: Prisma.TransactionClient): Promise<void> {
    const run = async (db: PrismaLike): Promise<void> => {
      const now = new Date();
      await db.curriculum.findFirst({
        where: { id: input.curriculumId, userId: input.userId },
      }).then((curriculum) => {
        if (curriculum === null) throw new Error('Curriculum not found.');
      });
      await db.curriculumVersion.updateMany({
        where: {
          curriculumId: input.curriculumId,
          state: 'ACTIVE',
          id: { not: input.curriculumVersionId },
        },
        data: { state: 'SUPERSEDED', supersededAt: now },
      });
      await db.curriculumVersion.update({
        where: { id: input.curriculumVersionId, curriculumId: input.curriculumId },
        data: {
          state: 'ACTIVE',
          guardianValidationId: input.guardianValidationId,
          finalizedAt: now,
          supersededAt: null,
        },
      });
      await db.curriculum.update({
        where: { id: input.curriculumId, userId: input.userId },
        data: { activeVersionId: input.curriculumVersionId, state: 'FINALIZED' },
      });
    };
    if (tx !== undefined) {
      await run(this.db(tx as unknown as PrismaLike));
      return;
    }
    await this.prisma.$transaction(run);
  }

  async setFrozenNode(input: {
    userId: UserId;
    curriculumId: CurriculumId;
    stableNodeKey: string;
    frozen: boolean;
  }, tx?: Prisma.TransactionClient): Promise<void> {
    const current = await this.getById(input.userId, input.curriculumId);
    const metadata = current?.metadata ?? {};
    const frozen = new Set(metadata.frozenStableNodeKeys ?? []);
    if (input.frozen) frozen.add(input.stableNodeKey);
    else frozen.delete(input.stableNodeKey);
    await this.db(tx as unknown as PrismaLike).curriculum.update({
      where: { id: input.curriculumId, userId: input.userId },
      data: { metadata: { ...metadata, frozenStableNodeKeys: [...frozen].sort() } },
    });
  }

  async updateCurriculumMetadata(input: {
    userId: UserId;
    curriculumId: CurriculumId;
    metadata: ICurriculum['metadata'];
  }, tx?: Prisma.TransactionClient): Promise<void> {
    await this.db(tx as unknown as PrismaLike).curriculum.update({
      where: { id: input.curriculumId, userId: input.userId },
      data: { metadata: input.metadata },
    });
  }

  async listRevisionProposals(
    userId: UserId,
    curriculumId: CurriculumId
  ): Promise<ICurriculumRevisionProposal[]> {
    const curriculum = await this.getById(userId, curriculumId);
    if (curriculum === undefined) return [];
    const rows = await this.prisma.curriculumRevisionProposal.findMany({
      where: { curriculumId },
      include: { changes: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapProposal);
  }

  async createRevisionProposal(input: {
    userId: UserId;
    curriculumId: CurriculumId;
    proposedFromVersionId: CurriculumVersionId;
    reason: ICurriculumRevisionProposal['reason'];
    evidence: Record<string, unknown>;
    rationale: string;
    changes: Array<{
      kind: ICurriculumRevisionProposal['changes'][number]['kind'];
      payload: Record<string, unknown>;
      rationale?: string;
    }>;
    expiresAt?: Date | string;
  }, tx?: Prisma.TransactionClient): Promise<ICurriculumRevisionProposal> {
    const curriculum = await this.getById(input.userId, input.curriculumId);
    if (curriculum === undefined) throw new Error('Curriculum not found.');
    const proposalId = `${ID_PREFIXES.RevisionProposalId}${nanoid(21)}` as RevisionProposalId;
    const expiresAt =
      input.expiresAt !== undefined
        ? new Date(input.expiresAt)
        : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const row = await this.db(tx as unknown as PrismaLike).curriculumRevisionProposal.create({
      data: {
        id: proposalId,
        curriculumId: input.curriculumId,
        proposedFromVersionId: input.proposedFromVersionId,
        reason: toDbEnum(input.reason),
        evidence: input.evidence,
        rationale: input.rationale,
        expiresAt,
        changes: {
          create: input.changes.map((change) => ({
            id: `${ID_PREFIXES.RevisionChangeId}${nanoid(21)}`,
            kind: toDbEnum(change.kind),
            payload: change.payload,
            rationale: change.rationale,
            state: toDbEnum(RevisionChangeState.PENDING),
          })),
        },
      },
      include: { changes: true },
    });
    return mapProposal(row);
  }

  async decideRevisionChange(input: {
    userId: UserId;
    curriculumId: CurriculumId;
    proposalId: RevisionProposalId;
    changeId: RevisionChangeId;
    state: RevisionChangeState;
  }, tx?: Prisma.TransactionClient): Promise<ICurriculumRevisionProposal> {
    const curriculum = await this.getById(input.userId, input.curriculumId);
    if (curriculum === undefined) throw new Error('Curriculum not found.');
    const db = this.db(tx as unknown as PrismaLike);
    const proposal = await db.curriculumRevisionProposal.findFirst({
      where: { id: input.proposalId, curriculumId: input.curriculumId },
      include: { changes: true },
    });
    if (proposal === null) throw new Error('Revision proposal not found.');
    const mapped = mapProposal(proposal);
    if (!mapped.changes.some((change) => change.id === input.changeId)) {
      throw new Error('Revision change not found.');
    }
    await db.revisionChange.update({
      where: { id: input.changeId, proposalId: input.proposalId },
      data: { state: toDbEnum(input.state), decidedAt: new Date() },
    });
    const updated = await db.curriculumRevisionProposal.findFirst({
      where: { id: input.proposalId, curriculumId: input.curriculumId },
      include: { changes: true },
    });
    if (updated === null) throw new Error('Revision proposal not found.');
    return mapProposal(updated);
  }

  async applyRevisionProposal(input: {
    userId: UserId;
    curriculumId: CurriculumId;
    proposalId: RevisionProposalId;
    guardianValidationId?: string;
  }, tx?: Prisma.TransactionClient): Promise<ICurriculumRevisionProposal> {
    const curriculum = await this.getById(input.userId, input.curriculumId);
    if (curriculum === undefined) throw new Error('Curriculum not found.');
    const proposal = await this.db(tx as unknown as PrismaLike).curriculumRevisionProposal.findFirst({
      where: { id: input.proposalId, curriculumId: input.curriculumId },
      include: { changes: true },
    });
    if (proposal === null) throw new Error('Revision proposal not found.');
    const mapped = mapProposal(proposal);
    const approved = mapped.changes.filter(
      (change) => change.state === RevisionChangeState.APPROVED
    );
    if (approved.length === 0)
      throw new Error('Cannot apply revision proposal with zero approved changes.');

    await this.db(tx as unknown as PrismaLike).revisionChange.updateMany({
      where: {
        proposalId: input.proposalId,
        state: toDbEnum(RevisionChangeState.APPROVED),
      },
      data: { state: toDbEnum(RevisionChangeState.APPLIED), decidedAt: new Date() },
    });
    const updated = await this.db(tx as unknown as PrismaLike).curriculumRevisionProposal.update({
      where: { id: input.proposalId },
      data: { appliedVersionId: curriculum.activeVersionId ?? mapped.proposedFromVersionId },
      include: { changes: true },
    });
    void input.guardianValidationId;
    return mapProposal(updated);
  }

  async listRealignmentEvidence(
    userId: UserId,
    curriculumId: CurriculumId
  ): Promise<IRealignmentEvidence[]> {
    const curriculum = await this.getById(userId, curriculumId);
    if (curriculum === undefined) return [];
    const rows = await this.prisma.realignmentEvidence.findMany({
      where: { curriculumId },
      orderBy: { lastSeenAt: 'desc' },
    });
    return rows.map(mapEvidence);
  }

  async accumulateRealignmentEvidence(input: {
    userId: UserId;
    curriculumId: CurriculumId;
    stableNodeKey: string;
    triggerType: string;
    sessionId: SessionId;
    weight: number;
    threshold: number;
  }, tx?: Prisma.TransactionClient): Promise<IRealignmentEvidence> {
    const db = this.db(tx as unknown as PrismaLike);
    const [row] = await db.$queryRawUnsafe<unknown[]>(
      `INSERT INTO "realignment_evidence" (
         "id",
         "curriculum_id",
         "stable_node_key",
         "trigger_type",
         "session_ids",
         "accumulated_weight",
         "threshold"
       )
       VALUES ($1, $2, $3, $4, ARRAY[$5]::TEXT[], $6, $7)
       ON CONFLICT ("curriculum_id", "stable_node_key", "trigger_type")
       DO UPDATE SET
         "session_ids" = (
           SELECT ARRAY(
             SELECT DISTINCT session_id
             FROM unnest("realignment_evidence"."session_ids" || EXCLUDED."session_ids") AS session_id
             ORDER BY session_id
           )
         ),
         "accumulated_weight" =
           "realignment_evidence"."accumulated_weight" +
           CASE
             WHEN $5 = ANY("realignment_evidence"."session_ids") THEN 0
             ELSE EXCLUDED."accumulated_weight"
           END,
         "threshold" = EXCLUDED."threshold"
       RETURNING
         "id",
         "curriculum_id" AS "curriculumId",
         "stable_node_key" AS "stableNodeKey",
         "trigger_type" AS "triggerType",
         "session_ids" AS "sessionIds",
         "accumulated_weight" AS "accumulatedWeight",
         "threshold",
         "first_seen_at" AS "firstSeenAt",
         "last_seen_at" AS "lastSeenAt",
         "consumed_by_proposal_id" AS "consumedByProposalId"`,
      `revd_${nanoid(21)}`,
      input.curriculumId,
      input.stableNodeKey,
      input.triggerType,
      input.sessionId,
      input.weight,
      input.threshold
    );
    if (row === undefined) throw new Error('Realignment evidence upsert returned no row.');
    void input.userId;
    return mapEvidence(row);
  }
}

function toDbEnum(value: string): string {
  return value.toUpperCase();
}

function fromDbEnum(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

function mapCurriculum(row: unknown): ICurriculum {
  const value = row as Record<string, unknown>;
  const versions = Array.isArray(value['versions']) ? value['versions'] : [];
  return {
    id: value['id'] as ICurriculum['id'],
    userId: value['userId'] as ICurriculum['userId'],
    title: value['title'] as string,
    description: value['description'] as string | undefined,
    goal: value['goal'] as string | undefined,
    domain: value['domain'] as string | undefined,
    originMode: fromDbEnum(value['originMode']) as ICurriculum['originMode'],
    state: fromDbEnum(value['state'] ?? CurriculumState.DRAFT) as ICurriculum['state'],
    activeVersionId: value['activeVersionId'] as ICurriculum['activeVersionId'],
    metadata: (value['metadata'] as ICurriculum['metadata']) ?? {},
    createdAt: toIso(value['createdAt']),
    updatedAt: toIso(value['updatedAt']),
    activeVersion: versions.length > 0 ? mapVersion(versions[0]) : undefined,
  };
}

function mapVersion(row: unknown): ICurriculum['activeVersion'] {
  const value = row as Record<string, unknown>;
  return {
    id: value['id'] as NonNullable<ICurriculum['activeVersion']>['id'],
    curriculumId: value['curriculumId'] as NonNullable<
      ICurriculum['activeVersion']
    >['curriculumId'],
    versionNumber: value['versionNumber'] as number,
    state: fromDbEnum(value['state']) as NonNullable<ICurriculum['activeVersion']>['state'],
    parentVersionId: value['parentVersionId'] as NonNullable<
      ICurriculum['activeVersion']
    >['parentVersionId'],
    agentRunId: value['agentRunId'] as string | undefined,
    guardianValidationId: value['guardianValidationId'] as string | undefined,
    createdAt: toIso(value['createdAt']),
    finalizedAt: value['finalizedAt'] === null ? undefined : toIso(value['finalizedAt']),
    supersededAt: value['supersededAt'] === null ? undefined : toIso(value['supersededAt']),
    nodes: Array.isArray(value['nodes']) ? value['nodes'].map(mapNode) : [],
    edges: Array.isArray(value['edges']) ? value['edges'].map(mapEdge) : [],
  };
}

function mapVersionGraph(row: unknown): CurriculumVersionGraph {
  const value = row as Record<string, unknown>;
  return {
    id: value['id'] as CurriculumVersionId,
    nodes: Array.isArray(value['nodes']) ? value['nodes'].map(mapNode) : [],
    edges: Array.isArray(value['edges']) ? value['edges'].map(mapEdge) : [],
  };
}

function mapNode(row: unknown): NonNullable<ICurriculum['activeVersion']>['nodes'][number] {
  const value = row as Record<string, unknown>;
  return {
    id: value['id'] as NonNullable<ICurriculum['activeVersion']>['nodes'][number]['id'],
    curriculumVersionId: value['curriculumVersionId'] as NonNullable<
      ICurriculum['activeVersion']
    >['nodes'][number]['curriculumVersionId'],
    stableNodeKey: value['stableNodeKey'] as string,
    ckgConceptId: value['ckgConceptId'] as NonNullable<
      ICurriculum['activeVersion']
    >['nodes'][number]['ckgConceptId'],
    proposedConcept: value['proposedConcept'] as Record<string, unknown> | undefined,
    label: value['label'] as string,
    learningObjective: value['learningObjective'] as string | undefined,
    stabilityThreshold: value['stabilityThreshold'] as number,
    estimatedSessions: value['estimatedSessions'] as number,
    traversalWeight: value['traversalWeight'] as number,
    metadata: (value['metadata'] as Record<string, unknown>) ?? {},
  };
}

function mapEdge(row: unknown): NonNullable<ICurriculum['activeVersion']>['edges'][number] {
  const value = row as Record<string, unknown>;
  return {
    id: value['id'] as NonNullable<ICurriculum['activeVersion']>['edges'][number]['id'],
    curriculumVersionId: value['curriculumVersionId'] as NonNullable<
      ICurriculum['activeVersion']
    >['edges'][number]['curriculumVersionId'],
    fromNodeId: value['fromNodeId'] as NonNullable<
      ICurriculum['activeVersion']
    >['edges'][number]['fromNodeId'],
    toNodeId: value['toNodeId'] as NonNullable<
      ICurriculum['activeVersion']
    >['edges'][number]['toNodeId'],
    type: fromDbEnum(value['type']) as NonNullable<
      ICurriculum['activeVersion']
    >['edges'][number]['type'],
    rationale: value['rationale'] as string | undefined,
    orderingWeight: value['orderingWeight'] as number,
  };
}

function mapProgress(row: unknown): ICurriculumProgress {
  const value = row as Record<string, unknown>;
  return {
    id: value['id'] as string,
    curriculumId: value['curriculumId'] as ICurriculumProgress['curriculumId'],
    userId: value['userId'] as ICurriculumProgress['userId'],
    stableNodeKey: value['stableNodeKey'] as string,
    runtimeState: fromDbEnum(value['runtimeState']) as ICurriculumProgress['runtimeState'],
    firstTouchedAt: value['firstTouchedAt'] === null ? undefined : toIso(value['firstTouchedAt']),
    completedAt: value['completedAt'] === null ? undefined : toIso(value['completedAt']),
    lastSessionId: value['lastSessionId'] as ICurriculumProgress['lastSessionId'],
    evaluationCount: value['evaluationCount'] as number,
    correctStreak: value['correctStreak'] as number,
    stabilitySnapshot: value['stabilitySnapshot'] as number | undefined,
  };
}

function mapProposal(row: unknown): ICurriculumRevisionProposal {
  const value = row as Record<string, unknown>;
  return {
    id: value['id'] as ICurriculumRevisionProposal['id'],
    curriculumId: value['curriculumId'] as ICurriculumRevisionProposal['curriculumId'],
    proposedFromVersionId: value[
      'proposedFromVersionId'
    ] as ICurriculumRevisionProposal['proposedFromVersionId'],
    reason: fromDbEnum(value['reason']) as ICurriculumRevisionProposal['reason'],
    evidence: (value['evidence'] as Record<string, unknown>) ?? {},
    rationale: value['rationale'] as string,
    expiresAt: toIso(value['expiresAt']),
    createdAt: toIso(value['createdAt']),
    appliedVersionId: value['appliedVersionId'] as ICurriculumRevisionProposal['appliedVersionId'],
    changes: Array.isArray(value['changes'])
      ? value['changes'].map((change) => {
          const changeValue = change as Record<string, unknown>;
          return {
            id: changeValue['id'] as ICurriculumRevisionProposal['changes'][number]['id'],
            proposalId: changeValue[
              'proposalId'
            ] as ICurriculumRevisionProposal['changes'][number]['proposalId'],
            kind: fromDbEnum(
              changeValue['kind']
            ) as ICurriculumRevisionProposal['changes'][number]['kind'],
            payload: (changeValue['payload'] as Record<string, unknown>) ?? {},
            rationale: changeValue['rationale'] as string | undefined,
            state: fromDbEnum(
              changeValue['state']
            ) as ICurriculumRevisionProposal['changes'][number]['state'],
            decidedAt:
              changeValue['decidedAt'] === null ? undefined : toIso(changeValue['decidedAt']),
            rejectionReason: changeValue['rejectionReason'] as string | undefined,
          };
        })
      : [],
  };
}

function mapEvidence(row: unknown): IRealignmentEvidence {
  const value = row as Record<string, unknown>;
  return {
    id: value['id'] as string,
    curriculumId: value['curriculumId'] as IRealignmentEvidence['curriculumId'],
    stableNodeKey: value['stableNodeKey'] as string,
    triggerType: value['triggerType'] as string,
    sessionIds: value['sessionIds'] as IRealignmentEvidence['sessionIds'],
    accumulatedWeight: value['accumulatedWeight'] as number,
    threshold: value['threshold'] as number,
    firstSeenAt: toIso(value['firstSeenAt']),
    lastSeenAt: toIso(value['lastSeenAt']),
    consumedByProposalId:
      value['consumedByProposalId'] === null
        ? undefined
        : (value['consumedByProposalId'] as IRealignmentEvidence['consumedByProposalId']),
  };
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}
