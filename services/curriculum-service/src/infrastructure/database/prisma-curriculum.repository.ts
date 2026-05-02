/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/no-unnecessary-condition */
import type {
  ICurriculum,
  ICurriculumProgress,
  ICurriculumRevisionProposal,
  ICreateCurriculumInput,
  IRealignmentEvidence,
} from '@noema/contracts';
import { CurriculumOriginMode, CurriculumState, RevisionChangeState } from '@noema/types';
import type {
  CurriculumId,
  CurriculumNodeRuntimeState,
  CurriculumVersionId,
  RevisionChangeId,
  RevisionProposalId,
  SessionId,
  UserId,
} from '@noema/types';
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
  };
  curriculumProgress: {
    findMany(args: unknown): Promise<unknown[]>;
    upsert(args: unknown): Promise<unknown>;
  };
  curriculumRevisionProposal: {
    findMany(args: unknown): Promise<unknown[]>;
    findFirst(args: unknown): Promise<unknown>;
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
  $transaction<T>(fn: (tx: PrismaLike) => Promise<T>): Promise<T>;
}

export class PrismaCurriculumRepository implements CurriculumRepository {
  constructor(private readonly prisma: PrismaLike) {}

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

  async create(userId: UserId, input: ICreateCurriculumInput): Promise<ICurriculum> {
    const row = await this.prisma.curriculum.create({
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

  async listProgress(userId: UserId, curriculumId: CurriculumId): Promise<ICurriculumProgress[]> {
    const rows = await this.prisma.curriculumProgress.findMany({
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
  }): Promise<ICurriculumProgress> {
    const row = await this.prisma.curriculumProgress.upsert({
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

  async saveDraftVersion(input: {
    curriculumId: CurriculumId;
    parentVersionId?: CurriculumVersionId;
    graph: CurriculumVersionGraph;
    agentRunId?: string;
  }): Promise<CurriculumVersionId> {
    const id = input.graph.id;
    await this.prisma.curriculumVersion.create({
      data: {
        id,
        curriculumId: input.curriculumId,
        versionNumber: 1,
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
  }): Promise<void> {
    await this.prisma.curriculum.update({
      where: { id: input.curriculumId, userId: input.userId },
      data: { activeVersionId: input.curriculumVersionId, state: 'FINALIZED' },
    });
  }

  async setFrozenNode(input: {
    userId: UserId;
    curriculumId: CurriculumId;
    stableNodeKey: string;
    frozen: boolean;
  }): Promise<void> {
    const current = await this.getById(input.userId, input.curriculumId);
    const metadata = current?.metadata ?? {};
    const frozen = new Set(metadata.frozenStableNodeKeys ?? []);
    if (input.frozen) frozen.add(input.stableNodeKey);
    else frozen.delete(input.stableNodeKey);
    await this.prisma.curriculum.update({
      where: { id: input.curriculumId, userId: input.userId },
      data: { metadata: { ...metadata, frozenStableNodeKeys: [...frozen].sort() } },
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

  async decideRevisionChange(input: {
    userId: UserId;
    curriculumId: CurriculumId;
    proposalId: RevisionProposalId;
    changeId: RevisionChangeId;
    state: RevisionChangeState;
  }): Promise<ICurriculumRevisionProposal> {
    const curriculum = await this.getById(input.userId, input.curriculumId);
    if (curriculum === undefined) throw new Error('Curriculum not found.');
    await this.prisma.revisionChange.update({
      where: { id: input.changeId, proposalId: input.proposalId },
      data: { state: toDbEnum(input.state), decidedAt: new Date() },
    });
    const proposal = await this.prisma.curriculumRevisionProposal.findFirst({
      where: { id: input.proposalId, curriculumId: input.curriculumId },
      include: { changes: true },
    });
    if (proposal === null) throw new Error('Revision proposal not found.');
    return mapProposal(proposal);
  }

  async applyRevisionProposal(input: {
    userId: UserId;
    curriculumId: CurriculumId;
    proposalId: RevisionProposalId;
    guardianValidationId?: string;
  }): Promise<ICurriculumRevisionProposal> {
    const curriculum = await this.getById(input.userId, input.curriculumId);
    if (curriculum === undefined) throw new Error('Curriculum not found.');
    const proposal = await this.prisma.curriculumRevisionProposal.findFirst({
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

    await this.prisma.revisionChange.updateMany({
      where: {
        proposalId: input.proposalId,
        state: toDbEnum(RevisionChangeState.APPROVED),
      },
      data: { state: toDbEnum(RevisionChangeState.APPLIED), decidedAt: new Date() },
    });
    const updated = await this.prisma.curriculumRevisionProposal.update({
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
  }): Promise<IRealignmentEvidence> {
    const currentRows = await this.prisma.realignmentEvidence.findMany({
      where: {
        curriculumId: input.curriculumId,
        stableNodeKey: input.stableNodeKey,
        triggerType: input.triggerType,
      },
      take: 1,
    });
    const current = currentRows.length > 0 ? mapEvidence(currentRows[0]) : undefined;
    const sessionIds = Array.from(new Set([...(current?.sessionIds ?? []), input.sessionId]));
    const accumulatedWeight = (current?.accumulatedWeight ?? 0) + input.weight;
    const row = await this.prisma.realignmentEvidence.upsert({
      where: {
        curriculumId_stableNodeKey_triggerType: {
          curriculumId: input.curriculumId,
          stableNodeKey: input.stableNodeKey,
          triggerType: input.triggerType,
        },
      },
      create: {
        id: `revd_${nanoid(21)}`,
        curriculumId: input.curriculumId,
        stableNodeKey: input.stableNodeKey,
        triggerType: input.triggerType,
        sessionIds,
        accumulatedWeight,
        threshold: input.threshold,
      },
      update: {
        sessionIds,
        accumulatedWeight,
        threshold: input.threshold,
      },
    });
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
