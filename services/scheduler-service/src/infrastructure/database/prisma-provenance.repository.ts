import type { PrismaClient } from '../../../generated/prisma/index.js';
import type {
  ICohortLineageInput,
  ICommitProvenanceInput,
  IProposalProvenanceInput,
  ISchedulerProvenanceRepository,
} from '../../domain/scheduler-service/scheduler.repository.js';

export class PrismaProvenanceRepository implements ISchedulerProvenanceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async recordProposal(input: IProposalProvenanceInput): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO schedule_proposals (
        id,
        decision_id,
        user_id,
        policy_version,
        correlation_id,
        session_id,
        session_revision,
        kind,
        payload
      )
      VALUES (
        ${input.proposalId},
        ${input.decisionId},
        ${input.userId},
        ${input.policyVersion},
        ${input.correlationId},
        ${input.sessionId ?? null},
        ${input.sessionRevision},
        ${input.kind},
        ${JSON.stringify(input.payload)}::jsonb
      )
    `;
  }

  async recordCommit(input: ICommitProvenanceInput): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO schedule_commits (
        id,
        proposal_id,
        decision_id,
        user_id,
        policy_version,
        correlation_id,
        session_id,
        session_revision,
        kind,
        accepted,
        rejected,
        payload
      )
      VALUES (
        ${input.commitId},
        ${input.proposalId ?? null},
        ${input.decisionId},
        ${input.userId},
        ${input.policyVersion},
        ${input.correlationId},
        ${input.sessionId ?? null},
        ${input.sessionRevision},
        ${input.kind},
        ${input.accepted},
        ${input.rejected},
        ${JSON.stringify(input.payload)}::jsonb
      )
    `;
  }

  async recordCohortLineage(input: ICohortLineageInput): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO schedule_cohort_lineage (
        id,
        user_id,
        proposal_id,
        decision_id,
        session_id,
        session_revision,
        operation_kind,
        selected_card_ids,
        excluded_card_ids,
        metadata
      )
      VALUES (
        ${input.id},
        ${input.userId},
        ${input.proposalId ?? null},
        ${input.decisionId},
        ${input.sessionId ?? null},
        ${input.sessionRevision},
        ${input.operationKind},
        ${input.selectedCardIds},
        ${input.excludedCardIds},
        ${JSON.stringify(input.metadata)}::jsonb
      )
    `;
  }
}
