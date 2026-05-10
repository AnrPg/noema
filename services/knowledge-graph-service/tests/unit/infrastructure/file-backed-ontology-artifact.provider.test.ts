import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_ONTOLOGY_ARTIFACT } from '../../../src/domain/knowledge-graph-service/ontology-reasoning.js';
import { FileBackedOntologyArtifactProvider } from '../../../src/infrastructure/ontology/file-backed-ontology-artifact.provider.js';

const createdDirectories: string[] = [];

async function createArtifactPath(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'noema-ontology-artifact-'));
  createdDirectories.push(directory);
  return path.join(directory, 'active-ontology-artifact.json');
}

afterEach(async () => {
  await Promise.all(
    createdDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe('FileBackedOntologyArtifactProvider', () => {
  it('materializes the default ontology artifact to graph-owned storage when missing', async () => {
    const artifactPath = await createArtifactPath();
    const provider = new FileBackedOntologyArtifactProvider(artifactPath);

    await provider.initialize();
    const raw = await readFile(artifactPath, 'utf8');

    expect(raw).toContain('"version": "dual-graph-ontology-v1"');
    expect(provider.getArtifact().version).toBe(DEFAULT_ONTOLOGY_ARTIFACT.version);
  });

  it('loads the active ontology artifact version from disk instead of a hardcoded in-memory provider', async () => {
    const artifactPath = await createArtifactPath();
    await writeFile(
      artifactPath,
      JSON.stringify(
        {
          ...DEFAULT_ONTOLOGY_ARTIFACT,
          version: 'dual-graph-ontology-v2-test',
        },
        null,
        2
      ),
      'utf8'
    );

    const provider = new FileBackedOntologyArtifactProvider(artifactPath);
    await provider.initialize();

    expect(provider.getArtifact().version).toBe('dual-graph-ontology-v2-test');
  });

  it('migrates legacy concept aliases in persisted ontology artifacts', async () => {
    const artifactPath = await createArtifactPath();
    await writeFile(
      artifactPath,
      JSON.stringify(
        {
          ...DEFAULT_ONTOLOGY_ARTIFACT,
          nodeClassHierarchy: {
            concept: ['knowledge_entity', 'concept_bearing', 'abstraction'],
            skill: ['knowledge_entity', 'concept_bearing', 'skill_like'],
            occupation: ['knowledge_entity', 'role_like'],
            fact: ['knowledge_entity', 'concept_bearing', 'fact_like'],
            procedure: ['knowledge_entity', 'concept_bearing', 'process_like'],
            principle: ['knowledge_entity', 'concept_bearing', 'rule_like'],
            example: ['knowledge_entity', 'instance_like', 'example_like'],
            counterexample: [
              'knowledge_entity',
              'instance_like',
              'example_like',
              'counterexample_like',
            ],
            misconception: ['knowledge_entity', 'diagnostic_like'],
          },
          illegalRetypings: [
            {
              from: 'example',
              to: 'concept',
              reason: 'legacy alias',
            },
          ],
        },
        null,
        2
      ),
      'utf8'
    );

    const provider = new FileBackedOntologyArtifactProvider(artifactPath);
    await provider.initialize();

    const raw = await readFile(artifactPath, 'utf8');
    expect(raw).not.toContain('"concept"');
    expect(raw).toContain('"notion"');
    expect(provider.getArtifact().nodeClassHierarchy.notion).toEqual([
      'knowledge_entity',
      'concept_bearing',
      'abstraction',
    ]);
    expect(provider.getArtifact().illegalRetypings[0]?.to).toBe('notion');
  });

  it('rejects malformed ontology artifacts during initialization', async () => {
    const artifactPath = await createArtifactPath();
    await writeFile(
      artifactPath,
      JSON.stringify(
        {
          version: 'broken-artifact',
          nodeClassHierarchy: {},
        },
        null,
        2
      ),
      'utf8'
    );

    const provider = new FileBackedOntologyArtifactProvider(artifactPath);

    await expect(provider.initialize()).rejects.toThrow();
  });
});
