import { nanoid } from 'nanoid';
import type { PrismaClient } from '../../../generated/prisma/index.js';
import {
  GuardianArtifactType,
  GuardianResult,
  type IGuardianRepository,
  type IGuardianValidation,
  type IGuardianValidationInput,
} from '../../domain/pedagogy-guardian-service/index.js';

type PrismaArtifactType = 'LESSON_PLAN' | 'STEP' | 'ACTIVITY' | 'REPLAN' | 'GENERATED_VARIANT';
type PrismaGuardianResult = 'ACCEPTED' | 'WARNING' | 'REJECTED';

export class PrismaGuardianRepository implements IGuardianRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createValidation(input: IGuardianValidationInput): Promise<IGuardianValidation> {
    const record = await this.prisma.guardianValidation.create({
      data: {
        id: `guard_${nanoid(21)}`,
        artifactType: toPrismaArtifactType(input.artifactType),
        artifactId: input.artifactId,
        artifactHash: input.artifactHash,
        result: toPrismaResult(input.result),
        reasonCodes: input.reasonCodes,
        blocking: input.blocking,
        evaluatedRules: input.evaluatedRules as never,
        triggeredBy: input.triggeredBy,
      },
    });
    return {
      id: record.id,
      artifactType: fromPrismaArtifactType(record.artifactType),
      artifactId: record.artifactId,
      artifactHash: record.artifactHash,
      result: fromPrismaResult(record.result),
      reasonCodes: record.reasonCodes,
      blocking: record.blocking,
      evaluatedRules: record.evaluatedRules,
      triggeredBy: record.triggeredBy,
      createdAt: record.createdAt.toISOString(),
    };
  }
}

function toPrismaArtifactType(value: GuardianArtifactType): PrismaArtifactType {
  switch (value) {
    case GuardianArtifactType.LESSON_PLAN:
      return 'LESSON_PLAN';
    case GuardianArtifactType.STEP:
      return 'STEP';
    case GuardianArtifactType.ACTIVITY:
      return 'ACTIVITY';
    case GuardianArtifactType.REPLAN:
      return 'REPLAN';
    case GuardianArtifactType.GENERATED_VARIANT:
      return 'GENERATED_VARIANT';
  }
}

function fromPrismaArtifactType(value: PrismaArtifactType): GuardianArtifactType {
  switch (value) {
    case 'LESSON_PLAN':
      return GuardianArtifactType.LESSON_PLAN;
    case 'STEP':
      return GuardianArtifactType.STEP;
    case 'ACTIVITY':
      return GuardianArtifactType.ACTIVITY;
    case 'REPLAN':
      return GuardianArtifactType.REPLAN;
    case 'GENERATED_VARIANT':
      return GuardianArtifactType.GENERATED_VARIANT;
  }
}

function toPrismaResult(value: GuardianResult): PrismaGuardianResult {
  switch (value) {
    case GuardianResult.ACCEPTED:
      return 'ACCEPTED';
    case GuardianResult.WARNING:
      return 'WARNING';
    case GuardianResult.REJECTED:
      return 'REJECTED';
  }
}

function fromPrismaResult(value: PrismaGuardianResult): GuardianResult {
  switch (value) {
    case 'ACCEPTED':
      return GuardianResult.ACCEPTED;
    case 'WARNING':
      return GuardianResult.WARNING;
    case 'REJECTED':
      return GuardianResult.REJECTED;
  }
}
