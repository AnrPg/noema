import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../../../generated/prisma/index.js';

import { PrismaMutationRepository } from '../../../src/infrastructure/database/repositories/prisma-mutation.repository.js';

const databaseUrl = process.env['DATABASE_URL'];
const hasDatabaseIntegration = databaseUrl !== undefined && databaseUrl !== '';

describe.runIf(hasDatabaseIntegration)('Prisma — Mutation Repository', () => {
  const prisma = new PrismaClient();
  const repository = new PrismaMutationRepository(prisma);
  const createdMutationIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    if (createdMutationIds.length > 0) {
      await prisma.ckgMutation.deleteMany({
        where: { id: { in: createdMutationIds } },
      });
    }
    await prisma.$disconnect();
  });

  it('creates, transitions, and audits a real mutation record', async () => {
    const mutation = await repository.createMutation({
      proposedBy: 'agent_integration_test' as never,
      operations: [
        {
          type: 'add_node',
          label: 'Integration Concept',
          nodeType: 'concept',
          domain: 'integration',
          rationale: 'integration test',
        },
      ],
      rationale: 'integration test mutation',
      evidenceCount: 1,
    });
    createdMutationIds.push(mutation.mutationId);

    const transitioned = await repository.transitionStateWithAudit(
      mutation.mutationId,
      'validating',
      mutation.version,
      {
        mutationId: mutation.mutationId,
        fromState: 'proposed',
        toState: 'validating',
        performedBy: 'system',
      }
    );

    const loaded = await repository.getMutation(mutation.mutationId);
    const auditLog = await repository.getAuditLog(mutation.mutationId);

    expect(loaded?.state).toBe('validating');
    expect(transitioned.audit.toState).toBe('validating');
    expect(auditLog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          mutationId: mutation.mutationId,
          toState: 'validating',
        }),
      ])
    );
  });
});
