import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Metadata, MutationId } from '@noema/types';

import {
  buildProofModel,
  ProofRolloutMode,
} from '../../../src/domain/knowledge-graph-service/proof-stage.js';
import { TlaProofRunner } from '../../../src/infrastructure/proof/tla-proof-runner.js';

const createdDirectories: string[] = [];

function createMutation(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    mutationId: 'mut_tlaproofaaaaaaaaaaaa' as MutationId,
    state: 'validated',
    proposedBy: 'agent_proof_tester',
    version: 1,
    rationale: 'Proof stage test mutation',
    evidenceCount: 2,
    createdAt: '2026-04-02T10:00:00.000Z',
    updatedAt: '2026-04-02T10:00:00.000Z',
    recoveryAttempts: 0,
    revisionCount: 0,
    revisionFeedback: null,
    operations: [
      {
        type: 'update_node',
        nodeId: 'node_alphaaaaaaaaaaaaaaaa',
        updates: {
          label: 'Alpha',
        },
        rationale: 'Rename alpha',
      },
    ] as Metadata[],
    ...overrides,
  } as never;
}

function createContext() {
  return {
    userId: 'user_proofstageaaaaaaaaaaa' as never,
    correlationId: 'corr_proofstageaaaaaaaaaa' as never,
    roles: ['system'],
  };
}

async function createArtifactRoot(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'noema-tla-proof-'));
  createdDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    createdDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe('TlaProofRunner', () => {
  it('persists proof artifacts and hard-blocks when the TLA backend is unavailable', async () => {
    const artifactRoot = await createArtifactRoot();
    const mutation = createMutation();
    const operations = mutation.operations as never;
    const runner = new TlaProofRunner(
      {
        artifactRootDirectory: artifactRoot,
        tlaToolsJarPath: null,
        javaBinary: 'java',
        timeoutMs: 1000,
      },
      {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      } as never
    );

    const result = await runner.runProof(
      mutation,
      operations,
      buildProofModel(mutation, operations),
      createContext(),
      ProofRolloutMode.HARD_BLOCK
    );

    expect(result.passed).toBe(false);
    expect(result.enforcement).toBe('rejected');
    expect(result.artifactRef).toBeTruthy();
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PROOF_TLA_BACKEND_UNAVAILABLE',
        }),
      ])
    );

    const modelArtifact = await readFile(path.join(result.artifactRef!, 'model.json'), 'utf8');
    const tlaArtifact = await readFile(
      path.join(result.artifactRef!, 'NoemaMutationProof.tla'),
      'utf8'
    );
    const tlaConfig = await readFile(
      path.join(result.artifactRef!, 'NoemaMutationProof.cfg'),
      'utf8'
    );

    expect(modelArtifact).toContain('"mutationId": "mut_tlaproofaaaaaaaaaaaa"');
    expect(tlaArtifact).toContain('MODULE NoemaMutationProof');
    expect(tlaConfig).toContain('PROPERTY Termination');
    expect(tlaArtifact).toContain('DuplicateFingerprints == {}');
    expect(tlaArtifact).toContain('DependencyEdges == {}');
    expect(tlaArtifact).toContain('OntologyViolationWitnesses == {}');
  });

  it('treats backend-unavailable proof findings as observe-only diagnostics in soft-block mode', async () => {
    const artifactRoot = await createArtifactRoot();
    const mutation = createMutation();
    const operations = mutation.operations as never;
    const runner = new TlaProofRunner(
      {
        artifactRootDirectory: artifactRoot,
        tlaToolsJarPath: null,
        javaBinary: 'java',
        timeoutMs: 1000,
      },
      {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      } as never
    );

    const result = await runner.runProof(
      mutation,
      operations,
      buildProofModel(mutation, operations),
      createContext(),
      ProofRolloutMode.SOFT_BLOCK
    );

    expect(result.passed).toBe(false);
    expect(result.enforcement).toBe('observe_only');
  });
});
