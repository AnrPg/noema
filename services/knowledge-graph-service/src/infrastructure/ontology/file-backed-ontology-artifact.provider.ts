import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GraphEdgeType, GraphNodeType } from '@noema/types';
import { z } from 'zod';

import type {
  IOntologyArtifact,
  IOntologyArtifactProvider,
} from '../../domain/knowledge-graph-service/ontology-reasoning.js';
import { DEFAULT_ONTOLOGY_ARTIFACT } from '../../domain/knowledge-graph-service/ontology-reasoning.js';

const OntologyArtifactSchema = z.object({
  version: z.string().min(1),
  nodeClassHierarchy: z.record(
    z.nativeEnum(GraphNodeType),
    z.array(
      z.enum([
        'knowledge_entity',
        'concept_bearing',
        'abstraction',
        'process_like',
        'rule_like',
        'fact_like',
        'skill_like',
        'role_like',
        'instance_like',
        'example_like',
        'counterexample_like',
        'diagnostic_like',
      ])
    )
  ),
  disjointNodeClasses: z.array(
    z.tuple([
      z.enum([
        'knowledge_entity',
        'concept_bearing',
        'abstraction',
        'process_like',
        'rule_like',
        'fact_like',
        'skill_like',
        'role_like',
        'instance_like',
        'example_like',
        'counterexample_like',
        'diagnostic_like',
      ]),
      z.enum([
        'knowledge_entity',
        'concept_bearing',
        'abstraction',
        'process_like',
        'rule_like',
        'fact_like',
        'skill_like',
        'role_like',
        'instance_like',
        'example_like',
        'counterexample_like',
        'diagnostic_like',
      ]),
    ])
  ),
  edgeConstraints: z.record(
    z.nativeEnum(GraphEdgeType),
    z.object({
      edgeType: z.nativeEnum(GraphEdgeType),
      sourceClasses: z.array(
        z.enum([
          'knowledge_entity',
          'concept_bearing',
          'abstraction',
          'process_like',
          'rule_like',
          'fact_like',
          'skill_like',
          'role_like',
          'instance_like',
          'example_like',
          'counterexample_like',
          'diagnostic_like',
        ])
      ),
      targetClasses: z.array(
        z.enum([
          'knowledge_entity',
          'concept_bearing',
          'abstraction',
          'process_like',
          'rule_like',
          'fact_like',
          'skill_like',
          'role_like',
          'instance_like',
          'example_like',
          'counterexample_like',
          'diagnostic_like',
        ])
      ),
      sameKindRequired: z.boolean().optional(),
    })
  ),
  illegalRetypings: z.array(
    z.object({
      from: z.nativeEnum(GraphNodeType),
      to: z.nativeEnum(GraphNodeType),
      reason: z.string().min(1),
    })
  ),
});

export class FileBackedOntologyArtifactProvider implements IOntologyArtifactProvider {
  private cachedArtifact: IOntologyArtifact | null = null;

  constructor(private readonly artifactPath: string) {}

  async initialize(): Promise<void> {
    const resolvedPath = this.resolveArtifactPath();
    try {
      await stat(resolvedPath);
    } catch {
      await mkdir(path.dirname(resolvedPath), { recursive: true });
      await writeFile(resolvedPath, JSON.stringify(DEFAULT_ONTOLOGY_ARTIFACT, null, 2), 'utf8');
    }
    this.cachedArtifact = await this.loadArtifact(resolvedPath);
  }

  getArtifact(): IOntologyArtifact {
    if (this.cachedArtifact === null) {
      throw new Error(
        'Ontology artifact provider was used before initialization. Call initialize() during bootstrap.'
      );
    }
    return this.cachedArtifact;
  }

  private async loadArtifact(resolvedPath: string): Promise<IOntologyArtifact> {
    const raw = await readFile(resolvedPath, 'utf8');
    const parsed = OntologyArtifactSchema.parse(JSON.parse(raw));
    const nodeClassHierarchy = { ...DEFAULT_ONTOLOGY_ARTIFACT.nodeClassHierarchy };
    for (const nodeType of Object.keys(
      DEFAULT_ONTOLOGY_ARTIFACT.nodeClassHierarchy
    ) as GraphNodeType[]) {
      nodeClassHierarchy[nodeType] =
        parsed.nodeClassHierarchy[nodeType] ?? nodeClassHierarchy[nodeType];
    }

    const edgeConstraints = { ...DEFAULT_ONTOLOGY_ARTIFACT.edgeConstraints };
    for (const edgeType of Object.keys(
      DEFAULT_ONTOLOGY_ARTIFACT.edgeConstraints
    ) as GraphEdgeType[]) {
      const constraint = parsed.edgeConstraints[edgeType];
      if (constraint === undefined) {
        continue;
      }

      edgeConstraints[edgeType] = {
        edgeType: constraint.edgeType,
        sourceClasses: constraint.sourceClasses,
        targetClasses: constraint.targetClasses,
        ...(constraint.sameKindRequired !== undefined
          ? { sameKindRequired: constraint.sameKindRequired }
          : {}),
      };
    }

    return {
      version: parsed.version,
      nodeClassHierarchy,
      disjointNodeClasses: parsed.disjointNodeClasses,
      edgeConstraints,
      illegalRetypings: parsed.illegalRetypings,
    };
  }

  private resolveArtifactPath(): string {
    return path.resolve(this.artifactPath);
  }
}
