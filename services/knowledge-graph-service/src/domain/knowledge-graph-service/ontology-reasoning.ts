import {
  GraphEdgeType,
  GraphNodeType,
  type IGraphNode,
  type Metadata,
  type NodeId,
} from '@noema/types';

import type { IGraphRepository } from './graph.repository.js';
import type { ICkgMutation } from './mutation.repository.js';
import type {
  IValidationContext,
  IValidationStage,
  IValidationStageResult,
  IValidationViolation,
} from './validation.js';
import type { CkgMutationOperation } from './ckg-mutation-dsl.js';
import { CkgMutationOperationSchema, CkgOperationType } from './ckg-mutation-dsl.js';

type OntologyNodeClass =
  | 'knowledge_entity'
  | 'concept_bearing'
  | 'abstraction'
  | 'process_like'
  | 'rule_like'
  | 'fact_like'
  | 'skill_like'
  | 'role_like'
  | 'instance_like'
  | 'example_like'
  | 'counterexample_like'
  | 'diagnostic_like';

interface IOntologyEdgeConstraint {
  readonly edgeType: GraphEdgeType;
  readonly sourceClasses: readonly OntologyNodeClass[];
  readonly targetClasses: readonly OntologyNodeClass[];
  readonly sameKindRequired?: boolean;
}

interface IOntologyRetypingConstraint {
  readonly from: GraphNodeType;
  readonly to: GraphNodeType;
  readonly reason: string;
}

export interface IOntologyArtifact {
  readonly version: string;
  readonly nodeClassHierarchy: Readonly<Record<GraphNodeType, readonly OntologyNodeClass[]>>;
  readonly disjointNodeClasses: readonly Readonly<[OntologyNodeClass, OntologyNodeClass]>[];
  readonly edgeConstraints: Readonly<Record<GraphEdgeType, IOntologyEdgeConstraint>>;
  readonly illegalRetypings: readonly IOntologyRetypingConstraint[];
}

export interface IOntologyArtifactProvider {
  getArtifact(): IOntologyArtifact;
}

interface IEdgeReasoningInput {
  readonly edgeType: GraphEdgeType;
  readonly sourceNode: Pick<IGraphNode, 'nodeId' | 'nodeType' | 'label' | 'domain'>;
  readonly targetNode: Pick<IGraphNode, 'nodeId' | 'nodeType' | 'label' | 'domain'>;
}

interface IRetypingReasoningInput {
  readonly nodeId: NodeId;
  readonly currentType: GraphNodeType;
  readonly nextType: GraphNodeType;
  readonly label: string;
}

interface IOntologyReasoningOutcome {
  readonly errors: readonly IValidationViolation[];
  readonly warnings: readonly IValidationViolation[];
}

const NODE_CLASS_HIERARCHY: Readonly<Record<GraphNodeType, readonly OntologyNodeClass[]>> =
  Object.freeze({
    [GraphNodeType.CONCEPT]: ['knowledge_entity', 'concept_bearing', 'abstraction'],
    [GraphNodeType.SKILL]: ['knowledge_entity', 'concept_bearing', 'skill_like'],
    [GraphNodeType.OCCUPATION]: ['knowledge_entity', 'role_like'],
    [GraphNodeType.FACT]: ['knowledge_entity', 'concept_bearing', 'fact_like'],
    [GraphNodeType.PROCEDURE]: ['knowledge_entity', 'concept_bearing', 'process_like'],
    [GraphNodeType.PRINCIPLE]: ['knowledge_entity', 'concept_bearing', 'rule_like'],
    [GraphNodeType.EXAMPLE]: ['knowledge_entity', 'instance_like', 'example_like'],
    [GraphNodeType.COUNTEREXAMPLE]: [
      'knowledge_entity',
      'instance_like',
      'example_like',
      'counterexample_like',
    ],
    [GraphNodeType.MISCONCEPTION]: ['knowledge_entity', 'diagnostic_like'],
  });

const EDGE_CONSTRAINTS = {
  [GraphEdgeType.IS_A]: {
    edgeType: GraphEdgeType.IS_A,
    sourceClasses: ['abstraction', 'role_like'],
    targetClasses: ['abstraction', 'role_like'],
    sameKindRequired: true,
  },
  [GraphEdgeType.EXEMPLIFIES]: {
    edgeType: GraphEdgeType.EXEMPLIFIES,
    sourceClasses: ['example_like', 'process_like'],
    targetClasses: ['concept_bearing'],
  },
  [GraphEdgeType.PART_OF]: {
    edgeType: GraphEdgeType.PART_OF,
    sourceClasses: ['knowledge_entity'],
    targetClasses: ['abstraction', 'rule_like'],
  },
  [GraphEdgeType.CONSTITUTED_BY]: {
    edgeType: GraphEdgeType.CONSTITUTED_BY,
    sourceClasses: ['abstraction', 'process_like', 'rule_like'],
    targetClasses: ['abstraction', 'fact_like', 'rule_like'],
  },
  [GraphEdgeType.EQUIVALENT_TO]: {
    edgeType: GraphEdgeType.EQUIVALENT_TO,
    sourceClasses: ['concept_bearing', 'role_like'],
    targetClasses: ['concept_bearing', 'role_like'],
    sameKindRequired: true,
  },
  [GraphEdgeType.ENTAILS]: {
    edgeType: GraphEdgeType.ENTAILS,
    sourceClasses: ['concept_bearing'],
    targetClasses: ['concept_bearing'],
    sameKindRequired: true,
  },
  [GraphEdgeType.DISJOINT_WITH]: {
    edgeType: GraphEdgeType.DISJOINT_WITH,
    sourceClasses: ['concept_bearing', 'skill_like'],
    targetClasses: ['concept_bearing', 'skill_like'],
    sameKindRequired: true,
  },
  [GraphEdgeType.CONTRADICTS]: {
    edgeType: GraphEdgeType.CONTRADICTS,
    sourceClasses: ['knowledge_entity'],
    targetClasses: ['knowledge_entity'],
    sameKindRequired: true,
  },
  [GraphEdgeType.CAUSES]: {
    edgeType: GraphEdgeType.CAUSES,
    sourceClasses: ['knowledge_entity'],
    targetClasses: ['knowledge_entity'],
  },
  [GraphEdgeType.PRECEDES]: {
    edgeType: GraphEdgeType.PRECEDES,
    sourceClasses: ['concept_bearing'],
    targetClasses: ['concept_bearing'],
    sameKindRequired: true,
  },
  [GraphEdgeType.DEPENDS_ON]: {
    edgeType: GraphEdgeType.DEPENDS_ON,
    sourceClasses: ['knowledge_entity'],
    targetClasses: ['knowledge_entity'],
  },
  [GraphEdgeType.RELATED_TO]: {
    edgeType: GraphEdgeType.RELATED_TO,
    sourceClasses: ['knowledge_entity'],
    targetClasses: ['knowledge_entity'],
  },
  [GraphEdgeType.ANALOGOUS_TO]: {
    edgeType: GraphEdgeType.ANALOGOUS_TO,
    sourceClasses: ['knowledge_entity'],
    targetClasses: ['knowledge_entity'],
  },
  [GraphEdgeType.CONTRASTS_WITH]: {
    edgeType: GraphEdgeType.CONTRASTS_WITH,
    sourceClasses: ['knowledge_entity'],
    targetClasses: ['knowledge_entity'],
    sameKindRequired: true,
  },
  [GraphEdgeType.CONFUSABLE_WITH]: {
    edgeType: GraphEdgeType.CONFUSABLE_WITH,
    sourceClasses: ['skill_like'],
    targetClasses: ['skill_like'],
    sameKindRequired: true,
  },
  [GraphEdgeType.TRANSLATION_EQUIVALENT]: {
    edgeType: GraphEdgeType.TRANSLATION_EQUIVALENT,
    sourceClasses: ['concept_bearing'],
    targetClasses: ['concept_bearing'],
    sameKindRequired: true,
  },
  [GraphEdgeType.FALSE_FRIEND_OF]: {
    edgeType: GraphEdgeType.FALSE_FRIEND_OF,
    sourceClasses: ['concept_bearing'],
    targetClasses: ['concept_bearing'],
    sameKindRequired: true,
  },
  [GraphEdgeType.MINIMAL_PAIR_WITH]: {
    edgeType: GraphEdgeType.MINIMAL_PAIR_WITH,
    sourceClasses: ['concept_bearing'],
    targetClasses: ['concept_bearing'],
    sameKindRequired: true,
  },
  [GraphEdgeType.COLLOCATES_WITH]: {
    edgeType: GraphEdgeType.COLLOCATES_WITH,
    sourceClasses: ['concept_bearing'],
    targetClasses: ['concept_bearing'],
    sameKindRequired: true,
  },
  [GraphEdgeType.PREREQUISITE]: {
    edgeType: GraphEdgeType.PREREQUISITE,
    sourceClasses: ['concept_bearing'],
    targetClasses: ['concept_bearing', 'fact_like'],
  },
  [GraphEdgeType.DERIVED_FROM]: {
    edgeType: GraphEdgeType.DERIVED_FROM,
    sourceClasses: ['concept_bearing'],
    targetClasses: ['knowledge_entity'],
  },
  [GraphEdgeType.HAS_PROPERTY]: {
    edgeType: GraphEdgeType.HAS_PROPERTY,
    sourceClasses: ['concept_bearing'],
    targetClasses: ['abstraction', 'fact_like', 'rule_like'],
  },
  [GraphEdgeType.GOVERNS]: {
    edgeType: GraphEdgeType.GOVERNS,
    sourceClasses: ['abstraction', 'skill_like', 'process_like'],
    targetClasses: ['abstraction', 'skill_like', 'process_like'],
  },
  [GraphEdgeType.INFLECTED_FORM_OF]: {
    edgeType: GraphEdgeType.INFLECTED_FORM_OF,
    sourceClasses: ['abstraction', 'example_like'],
    targetClasses: ['abstraction', 'skill_like'],
  },
  [GraphEdgeType.SUBSKILL_OF]: {
    edgeType: GraphEdgeType.SUBSKILL_OF,
    sourceClasses: ['skill_like'],
    targetClasses: ['skill_like'],
    sameKindRequired: true,
  },
  [GraphEdgeType.HAS_SUBSKILL]: {
    edgeType: GraphEdgeType.HAS_SUBSKILL,
    sourceClasses: ['skill_like'],
    targetClasses: ['skill_like'],
    sameKindRequired: true,
  },
  [GraphEdgeType.ESSENTIAL_FOR_OCCUPATION]: {
    edgeType: GraphEdgeType.ESSENTIAL_FOR_OCCUPATION,
    sourceClasses: ['skill_like'],
    targetClasses: ['role_like'],
  },
  [GraphEdgeType.OCCUPATION_REQUIRES_ESSENTIAL_SKILL]: {
    edgeType: GraphEdgeType.OCCUPATION_REQUIRES_ESSENTIAL_SKILL,
    sourceClasses: ['role_like'],
    targetClasses: ['skill_like'],
  },
  [GraphEdgeType.OPTIONAL_FOR_OCCUPATION]: {
    edgeType: GraphEdgeType.OPTIONAL_FOR_OCCUPATION,
    sourceClasses: ['skill_like'],
    targetClasses: ['role_like'],
  },
  [GraphEdgeType.OCCUPATION_BENEFITS_FROM_OPTIONAL_SKILL]: {
    edgeType: GraphEdgeType.OCCUPATION_BENEFITS_FROM_OPTIONAL_SKILL,
    sourceClasses: ['role_like'],
    targetClasses: ['skill_like'],
  },
  [GraphEdgeType.TRANSFERABLE_TO]: {
    edgeType: GraphEdgeType.TRANSFERABLE_TO,
    sourceClasses: ['skill_like'],
    targetClasses: ['skill_like', 'abstraction', 'process_like'],
  },
} satisfies Readonly<Record<GraphEdgeType, IOntologyEdgeConstraint>>;

export const DEFAULT_ONTOLOGY_ARTIFACT: IOntologyArtifact = Object.freeze({
  version: 'dual-graph-ontology-v1',
  nodeClassHierarchy: NODE_CLASS_HIERARCHY,
  disjointNodeClasses: Object.freeze([
    ['concept_bearing', 'instance_like'],
    ['concept_bearing', 'diagnostic_like'],
    ['role_like', 'concept_bearing'],
    ['role_like', 'instance_like'],
    ['role_like', 'diagnostic_like'],
  ] as const),
  edgeConstraints: Object.freeze(EDGE_CONSTRAINTS),
  illegalRetypings: Object.freeze([
    {
      from: GraphNodeType.EXAMPLE,
      to: GraphNodeType.SKILL,
      reason:
        'Examples are learner-facing instances; promote the underlying concept first instead of retyping the instance as a skill.',
    },
    {
      from: GraphNodeType.EXAMPLE,
      to: GraphNodeType.CONCEPT,
      reason:
        'Examples should remain instances. Create or merge into the concept they illustrate rather than retyping them into abstractions.',
    },
    {
      from: GraphNodeType.COUNTEREXAMPLE,
      to: GraphNodeType.CONCEPT,
      reason: 'Counterexamples are diagnostic instances, not abstractions.',
    },
    {
      from: GraphNodeType.COUNTEREXAMPLE,
      to: GraphNodeType.SKILL,
      reason:
        'Counterexamples cannot be promoted into skills without losing their diagnostic role.',
    },
    {
      from: GraphNodeType.MISCONCEPTION,
      to: GraphNodeType.CONCEPT,
      reason:
        'Misconceptions must stay explicitly represented; resolve them through links or merges, not by erasing them via retyping.',
    },
    {
      from: GraphNodeType.OCCUPATION,
      to: GraphNodeType.CONCEPT,
      reason:
        'Occupations are role-like entities and cannot be silently collapsed into concept-bearing abstractions.',
    },
    {
      from: GraphNodeType.CONCEPT,
      to: GraphNodeType.OCCUPATION,
      reason:
        'Concepts and occupations belong to different ontology branches and require explicit canonical replacement instead of direct retyping.',
    },
  ]),
});

export class StaticOntologyArtifactProvider implements IOntologyArtifactProvider {
  getArtifact(): IOntologyArtifact {
    return DEFAULT_ONTOLOGY_ARTIFACT;
  }
}

export class OntologyReasoningService {
  constructor(private readonly artifactProvider: IOntologyArtifactProvider) {}

  getArtifact(): IOntologyArtifact {
    return this.artifactProvider.getArtifact();
  }

  getClassifications(nodeType: GraphNodeType): readonly OntologyNodeClass[] {
    return this.getArtifact().nodeClassHierarchy[nodeType];
  }

  reasonAboutEdgeAssertion(
    input: IEdgeReasoningInput,
    operationIndex: number
  ): IOntologyReasoningOutcome {
    const artifact = this.getArtifact();
    const constraint = artifact.edgeConstraints[input.edgeType];
    const sourceClasses = this.getClassifications(input.sourceNode.nodeType);
    const targetClasses = this.getClassifications(input.targetNode.nodeType);
    const errors: IValidationViolation[] = [];
    const warnings: IValidationViolation[] = [];

    if (!this.matchesAllowedClasses(sourceClasses, constraint.sourceClasses)) {
      errors.push({
        code: 'ONTOLOGICAL_CONFLICT',
        message:
          `Edge '${input.edgeType}' cannot originate from '${input.sourceNode.label}' ` +
          `(${input.sourceNode.nodeType}) because its inferred ontology classes ` +
          `do not satisfy the canonical domain requirements.`,
        severity: 'error',
        affectedOperationIndex: operationIndex,
        metadata: {
          artifactVersion: artifact.version,
          reasonCategory: 'domain_range',
          edgeType: input.edgeType,
          endpoint: 'source',
          nodeId: input.sourceNode.nodeId,
          nodeType: input.sourceNode.nodeType,
          inferredClassifications: [...sourceClasses],
          requiredClasses: [...constraint.sourceClasses],
        },
      });
    }

    if (!this.matchesAllowedClasses(targetClasses, constraint.targetClasses)) {
      errors.push({
        code: 'ONTOLOGICAL_CONFLICT',
        message:
          `Edge '${input.edgeType}' cannot target '${input.targetNode.label}' ` +
          `(${input.targetNode.nodeType}) because its inferred ontology classes ` +
          `do not satisfy the canonical range requirements.`,
        severity: 'error',
        affectedOperationIndex: operationIndex,
        metadata: {
          artifactVersion: artifact.version,
          reasonCategory: 'domain_range',
          edgeType: input.edgeType,
          endpoint: 'target',
          nodeId: input.targetNode.nodeId,
          nodeType: input.targetNode.nodeType,
          inferredClassifications: [...targetClasses],
          requiredClasses: [...constraint.targetClasses],
        },
      });
    }

    if (
      constraint.sameKindRequired === true &&
      !this.hasKindAlignment(sourceClasses, targetClasses)
    ) {
      errors.push({
        code: 'ONTOLOGICAL_CONFLICT',
        message:
          `Edge '${input.edgeType}' requires source and target to live in the same ontology branch, ` +
          `but '${input.sourceNode.label}' (${input.sourceNode.nodeType}) and '${input.targetNode.label}' ` +
          `(${input.targetNode.nodeType}) do not align.`,
        severity: 'error',
        affectedOperationIndex: operationIndex,
        metadata: {
          artifactVersion: artifact.version,
          reasonCategory: 'same_kind_required',
          edgeType: input.edgeType,
          sourceNodeId: input.sourceNode.nodeId,
          targetNodeId: input.targetNode.nodeId,
          sourceClassifications: [...sourceClasses],
          targetClassifications: [...targetClasses],
        },
      });
    }

    const disjointPair = this.findDisjointPair(sourceClasses, targetClasses);
    if (disjointPair !== null && this.requiresKindAlignment(input.edgeType)) {
      errors.push({
        code: 'ONTOLOGICAL_CONFLICT',
        message: `Edge '${input.edgeType}' connects nodes whose inferred classes are explicitly disjoint in the canonical ontology.`,
        severity: 'error',
        affectedOperationIndex: operationIndex,
        metadata: {
          artifactVersion: artifact.version,
          reasonCategory: 'disjoint_class',
          edgeType: input.edgeType,
          sourceNodeId: input.sourceNode.nodeId,
          targetNodeId: input.targetNode.nodeId,
          disjointClasses: [...disjointPair],
          sourceClassifications: [...sourceClasses],
          targetClassifications: [...targetClasses],
        },
      });
    }

    if (
      input.edgeType === GraphEdgeType.EQUIVALENT_TO &&
      input.sourceNode.domain !== input.targetNode.domain
    ) {
      warnings.push({
        code: 'ONTOLOGY_CROSS_DOMAIN_EQUIVALENCE',
        message:
          `Equivalent concepts span domains ('${input.sourceNode.domain}' vs '${input.targetNode.domain}'). ` +
          'Keep this only if the nodes are truly canonical aliases rather than analogies.',
        severity: 'warning',
        affectedOperationIndex: operationIndex,
        metadata: {
          artifactVersion: artifact.version,
          edgeType: input.edgeType,
          sourceDomain: input.sourceNode.domain,
          targetDomain: input.targetNode.domain,
          sourceClassifications: [...sourceClasses],
          targetClassifications: [...targetClasses],
        },
      });
    }

    return { errors, warnings };
  }

  reasonAboutRetyping(
    input: IRetypingReasoningInput,
    operationIndex: number
  ): IOntologyReasoningOutcome {
    const artifact = this.getArtifact();
    const illegalRetyping = artifact.illegalRetypings.find(
      (constraint) => constraint.from === input.currentType && constraint.to === input.nextType
    );

    if (illegalRetyping !== undefined) {
      return {
        errors: [
          {
            code: 'ONTOLOGY_ILLEGAL_TYPE_PROMOTION',
            message:
              `Cannot retype '${input.label}' from '${input.currentType}' to '${input.nextType}'. ` +
              illegalRetyping.reason,
            severity: 'error',
            affectedOperationIndex: operationIndex,
            metadata: {
              artifactVersion: artifact.version,
              reasonCategory: 'illegal_retyping',
              nodeId: input.nodeId,
              label: input.label,
              currentType: input.currentType,
              nextType: input.nextType,
              currentClassifications: [...this.getClassifications(input.currentType)],
              nextClassifications: [...this.getClassifications(input.nextType)],
            },
          },
        ],
        warnings: [],
      };
    }

    return { errors: [], warnings: [] };
  }

  private matchesAllowedClasses(
    inferredClasses: readonly OntologyNodeClass[],
    allowedClasses: readonly OntologyNodeClass[]
  ): boolean {
    return inferredClasses.some((candidate) => allowedClasses.includes(candidate));
  }

  private hasKindAlignment(
    sourceClasses: readonly OntologyNodeClass[],
    targetClasses: readonly OntologyNodeClass[]
  ): boolean {
    const sourceKind = this.pickPrimaryKind(sourceClasses);
    const targetKind = this.pickPrimaryKind(targetClasses);
    return sourceKind !== null && sourceKind === targetKind;
  }

  private pickPrimaryKind(
    classes: readonly OntologyNodeClass[]
  ): 'abstraction' | 'role_like' | 'instance_like' | 'diagnostic_like' | null {
    if (classes.includes('abstraction') || classes.includes('concept_bearing')) {
      return 'abstraction';
    }
    if (classes.includes('role_like')) {
      return 'role_like';
    }
    if (classes.includes('instance_like')) {
      return 'instance_like';
    }
    if (classes.includes('diagnostic_like')) {
      return 'diagnostic_like';
    }
    return null;
  }

  private requiresKindAlignment(edgeType: GraphEdgeType): boolean {
    return this.getArtifact().edgeConstraints[edgeType].sameKindRequired === true;
  }

  private findDisjointPair(
    sourceClasses: readonly OntologyNodeClass[],
    targetClasses: readonly OntologyNodeClass[]
  ): readonly [OntologyNodeClass, OntologyNodeClass] | null {
    for (const pair of this.getArtifact().disjointNodeClasses) {
      const [left, right] = pair;
      if (
        (sourceClasses.includes(left) && targetClasses.includes(right)) ||
        (sourceClasses.includes(right) && targetClasses.includes(left))
      ) {
        return pair;
      }
    }
    return null;
  }
}

export class OntologyReasoningStage implements IValidationStage {
  readonly name = 'ontology_reasoning';
  readonly order = 240;

  constructor(
    private readonly graphRepository: IGraphRepository,
    private readonly reasoningService: OntologyReasoningService
  ) {}

  async validate(
    mutation: ICkgMutation,
    context: IValidationContext
  ): Promise<IValidationStageResult> {
    const start = Date.now();
    const operations = parseOperations(mutation.operations);
    const violations: IValidationViolation[] = [];
    let inferredChecks = 0;

    for (let index = 0; index < operations.length; index++) {
      const operation = operations[index];
      if (operation === undefined) {
        continue;
      }

      if (operation.type === CkgOperationType.ADD_EDGE) {
        const edgeViolations = await this.validateAddEdge(operation, index, operations);
        inferredChecks += edgeViolations.length > 0 ? 1 : 0;
        violations.push(...edgeViolations);
      }

      if (
        operation.type === CkgOperationType.UPDATE_NODE &&
        operation.updates.nodeType !== undefined
      ) {
        const retypingViolations = await this.validateRetyping(operation, index);
        inferredChecks += retypingViolations.length > 0 ? 1 : 0;
        violations.push(...retypingViolations);
      }

      if (
        context.shortCircuitOnError &&
        violations.some((candidate) => candidate.severity === 'error')
      ) {
        break;
      }
    }

    const duration = Date.now() - start;
    const hasErrors = violations.some((candidate) => candidate.severity === 'error');

    return {
      stageName: this.name,
      passed: !hasErrors,
      details: hasErrors
        ? `Ontology reasoning found ${String(violations.length)} issue(s) across ${String(inferredChecks)} projected semantic check(s)`
        : 'Ontology reasoning passed with deterministic domain/range and classification checks',
      violations,
      duration,
    };
  }

  private async validateAddEdge(
    operation: Extract<CkgMutationOperation, { type: 'add_edge' }>,
    operationIndex: number,
    operations: readonly CkgMutationOperation[]
  ): Promise<readonly IValidationViolation[]> {
    const [sourceNode, targetNode] = await Promise.all([
      this.graphRepository.getNode(operation.sourceNodeId as NodeId),
      this.graphRepository.getNode(operation.targetNodeId as NodeId),
    ]);

    if (sourceNode === null || targetNode === null) {
      return [];
    }

    const sourceProjectedType = getProjectedNodeType(
      operation.sourceNodeId as NodeId,
      sourceNode.nodeType,
      operations
    );
    const targetProjectedType = getProjectedNodeType(
      operation.targetNodeId as NodeId,
      targetNode.nodeType,
      operations
    );

    const outcome = this.reasoningService.reasonAboutEdgeAssertion(
      {
        edgeType: operation.edgeType,
        sourceNode: {
          nodeId: sourceNode.nodeId,
          nodeType: sourceProjectedType,
          label: sourceNode.label,
          domain: sourceNode.domain,
        },
        targetNode: {
          nodeId: targetNode.nodeId,
          nodeType: targetProjectedType,
          label: targetNode.label,
          domain: targetNode.domain,
        },
      },
      operationIndex
    );

    return [...outcome.errors, ...outcome.warnings];
  }

  private async validateRetyping(
    operation: Extract<CkgMutationOperation, { type: 'update_node' }>,
    operationIndex: number
  ): Promise<readonly IValidationViolation[]> {
    const node = await this.graphRepository.getNode(operation.nodeId as NodeId);
    if (node === null || operation.updates.nodeType === undefined) {
      return [];
    }

    const outcome = this.reasoningService.reasonAboutRetyping(
      {
        nodeId: node.nodeId,
        currentType: node.nodeType,
        nextType: operation.updates.nodeType,
        label: node.label,
      },
      operationIndex
    );

    return [...outcome.errors, ...outcome.warnings];
  }
}

function parseOperations(raw: Metadata[]): CkgMutationOperation[] {
  return CkgMutationOperationSchema.array().parse(raw) as CkgMutationOperation[];
}

function getProjectedNodeType(
  nodeId: NodeId,
  currentType: GraphNodeType,
  operations: readonly CkgMutationOperation[]
): GraphNodeType {
  const plannedUpdate = operations.find(
    (candidate): candidate is Extract<CkgMutationOperation, { type: 'update_node' }> =>
      candidate.type === CkgOperationType.UPDATE_NODE &&
      candidate.nodeId === nodeId &&
      candidate.updates.nodeType !== undefined
  );

  return plannedUpdate?.updates.nodeType ?? currentType;
}
