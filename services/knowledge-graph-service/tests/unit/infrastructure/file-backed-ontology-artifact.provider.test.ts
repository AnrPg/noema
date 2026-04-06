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
