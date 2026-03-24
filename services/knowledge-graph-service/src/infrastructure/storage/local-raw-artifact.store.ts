/**
 * @noema/knowledge-graph-service - Local Raw Artifact Store
 *
 * Batch 2 storage adapter that keeps immutable artifact metadata mirrored on
 * disk. This gives import runs a concrete storage abstraction before source-
 * specific fetchers start writing real payload bytes in Batch 3.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  IImportArtifactRepository,
  IOntologyImportArtifact,
  IRawArtifactStore,
} from '../../domain/knowledge-graph-service/ontology-imports.contracts.js';

interface IStoredArtifactEnvelope {
  artifact: IOntologyImportArtifact;
}

export class LocalRawArtifactStore implements IRawArtifactStore {
  constructor(
    private readonly rootDirectory: string,
    private readonly artifactRepository: IImportArtifactRepository
  ) {}

  async saveArtifact(
    artifact: Omit<IOntologyImportArtifact, 'id' | 'createdAt'>
  ): Promise<IOntologyImportArtifact> {
    const persisted = await this.artifactRepository.create(artifact);
    const targetPath = this.resolveEnvelopePath(persisted.storageKey);

    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(
      targetPath,
      JSON.stringify({ artifact: persisted } satisfies IStoredArtifactEnvelope, null, 2),
      'utf8'
    );

    return persisted;
  }

  async savePayloadArtifact(input: {
    runId: string;
    sourceId: IOntologyImportArtifact['sourceId'];
    kind: IOntologyImportArtifact['kind'];
    storageKey: string;
    contentType: string | null;
    payload: Buffer | Uint8Array | string;
  }): Promise<IOntologyImportArtifact> {
    const payload =
      typeof input.payload === 'string'
        ? Buffer.from(input.payload, 'utf8')
        : Buffer.from(input.payload);
    const targetPath = this.resolvePayloadPath(input.storageKey);

    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, payload);

    return this.saveArtifact({
      runId: input.runId,
      sourceId: input.sourceId,
      kind: input.kind,
      storageKey: input.storageKey,
      contentType: input.contentType,
      checksum: createHash('sha256').update(payload).digest('hex'),
      sizeBytes: payload.byteLength,
    });
  }

  async getArtifact(storageKey: string): Promise<IOntologyImportArtifact | null> {
    try {
      const raw = await readFile(this.resolveEnvelopePath(storageKey), 'utf8');
      const envelope = JSON.parse(raw) as IStoredArtifactEnvelope;
      return envelope.artifact;
    } catch {
      return null;
    }
  }

  async readPayload(storageKey: string): Promise<Buffer> {
    return readFile(this.resolvePayloadPath(storageKey));
  }

  private resolveEnvelopePath(storageKey: string): string {
    return path.join(this.rootDirectory, `${storageKey}.json`);
  }

  private resolvePayloadPath(storageKey: string): string {
    return path.join(this.rootDirectory, storageKey);
  }
}
