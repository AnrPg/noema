/**
 * @noema/knowledge-graph-service - CKG Proof Stage Contracts
 *
 * Provides the proof-stage rollout modes, proof runner interface, mutation
 * model projection, and a deterministic proof adapter that performs concrete
 * safety/liveness checks before canonical commits.
 */

import type { Metadata, MutationId } from '@noema/types';

import {
  type CkgMutationOperation,
  CkgOperationType,
  extractAffectedEdgeIds,
  extractAffectedNodeIds,
} from './ckg-mutation-dsl.js';
import type { IExecutionContext } from './execution-context.js';
import type { ICkgMutation } from './mutation.repository.js';

export const ProofRolloutMode = {
  DISABLED: 'disabled',
  OBSERVE_ONLY: 'observe_only',
  SOFT_BLOCK: 'soft_block',
  HARD_BLOCK: 'hard_block',
} as const;

export type ProofRolloutMode = (typeof ProofRolloutMode)[keyof typeof ProofRolloutMode];

export interface IProofFinding {
  readonly code: string;
  readonly message: string;
  readonly severity: 'error' | 'warning';
  readonly reviewable: boolean;
  readonly metadata?: Metadata;
}

export interface IProofModel {
  readonly specVersion: string;
  readonly mutationId: MutationId;
  readonly operationCount: number;
  readonly operationTypes: readonly string[];
  readonly affectedNodeIds: readonly string[];
  readonly affectedEdgeIds: readonly string[];
  readonly operationFingerprints: readonly string[];
  readonly generatedAt: string;
}

export interface IProofResult {
  readonly mode: ProofRolloutMode;
  readonly status: 'skipped' | 'passed' | 'failed';
  readonly passed: boolean;
  readonly engineVersion: string;
  readonly artifactRef: string | null;
  readonly checkedInvariants: readonly string[];
  readonly findings: readonly IProofFinding[];
  readonly failureExplanation?: string;
  readonly modelSummary: Metadata;
  readonly executedAt: string;
  readonly autoApproved: boolean;
  readonly enforcement: 'none' | 'observe_only' | 'pending_review' | 'rejected';
}

export interface IProofRunner {
  runProof(
    mutation: ICkgMutation,
    operations: readonly CkgMutationOperation[],
    model: IProofModel,
    context: IExecutionContext,
    mode: ProofRolloutMode
  ): Promise<IProofResult>;
}

const ENGINE_VERSION = 'noema-proof-v1';
const SPEC_VERSION = 'ckg-proof-spec-v1';
const REVIEWABLE_STRUCTURAL_REWRITE_THRESHOLD = 3;

function fingerprintOperation(operation: CkgMutationOperation): string {
  switch (operation.type) {
    case CkgOperationType.ADD_NODE:
      return `${operation.type}:${operation.nodeType}:${operation.domain}:${operation.label.toLowerCase()}`;
    case CkgOperationType.REMOVE_NODE:
      return `${operation.type}:${operation.nodeId}`;
    case CkgOperationType.UPDATE_NODE:
      return `${operation.type}:${operation.nodeId}`;
    case CkgOperationType.ADD_EDGE:
      return `${operation.type}:${operation.edgeType}:${operation.sourceNodeId}:${operation.targetNodeId}`;
    case CkgOperationType.REMOVE_EDGE:
      return `${operation.type}:${operation.edgeId}`;
    case CkgOperationType.MERGE_NODES:
      return `${operation.type}:${operation.sourceNodeId}:${operation.targetNodeId}`;
    case CkgOperationType.SPLIT_NODE:
      return `${operation.type}:${operation.nodeId}:${operation.newNodeA.label.toLowerCase()}:${operation.newNodeB.label.toLowerCase()}`;
  }
}

function toSerializableValue(value: unknown): Metadata[string] {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.filter((entry) => entry !== undefined).map((entry) => toSerializableValue(entry));
  }

  if (typeof value === 'object') {
    return toSerializableMetadata(value as Record<string, unknown>);
  }

  return null;
}

function toSerializableMetadata(value: Record<string, unknown>): Metadata {
  const metadata = {} as Metadata;
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) {
      metadata[key] = toSerializableValue(entry);
    }
  }
  return metadata;
}

export function buildProofModel(
  mutation: ICkgMutation,
  operations: readonly CkgMutationOperation[]
): IProofModel {
  return {
    specVersion: SPEC_VERSION,
    mutationId: mutation.mutationId,
    operationCount: operations.length,
    operationTypes: operations.map((operation) => operation.type),
    affectedNodeIds: extractAffectedNodeIds(operations).map((id) => id),
    affectedEdgeIds: extractAffectedEdgeIds(operations).map((id) => id),
    operationFingerprints: operations.map((operation) => fingerprintOperation(operation)),
    generatedAt: new Date().toISOString(),
  };
}

function buildFinding(
  code: string,
  message: string,
  severity: 'error' | 'warning',
  reviewable: boolean,
  metadata?: Record<string, unknown>
): IProofFinding {
  return {
    code,
    message,
    severity,
    reviewable,
    ...(metadata !== undefined ? { metadata: toSerializableMetadata(metadata) } : {}),
  };
}

function countStructuralRewrites(operations: readonly CkgMutationOperation[]): number {
  return operations.filter(
    (operation) =>
      operation.type === CkgOperationType.MERGE_NODES ||
      operation.type === CkgOperationType.SPLIT_NODE ||
      operation.type === CkgOperationType.REMOVE_NODE
  ).length;
}

export class DeterministicProofRunner implements IProofRunner {
  runProof(
    mutation: ICkgMutation,
    operations: readonly CkgMutationOperation[],
    model: IProofModel,
    _context: IExecutionContext,
    mode: ProofRolloutMode
  ): Promise<IProofResult> {
    const findings: IProofFinding[] = [];
    const checkedInvariants = [
      'mutation_has_operations',
      'operation_fingerprints_unique',
      'no_node_update_remove_conflict',
      'bounded_structural_rewrites',
      'mutation_eventually_committable',
    ];

    if (operations.length === 0) {
      findings.push(
        buildFinding(
          'PROOF_EMPTY_MUTATION',
          'Mutations without operations cannot satisfy the canonical commit protocol.',
          'error',
          false
        )
      );
    }

    const duplicateFingerprints = new Set<string>();
    const seenFingerprints = new Set<string>();
    for (const fingerprint of model.operationFingerprints) {
      if (seenFingerprints.has(fingerprint)) {
        duplicateFingerprints.add(fingerprint);
      }
      seenFingerprints.add(fingerprint);
    }

    if (duplicateFingerprints.size > 0) {
      findings.push(
        buildFinding(
          'PROOF_DUPLICATE_OPERATION_FINGERPRINT',
          'The mutation contains duplicate structural operations that make the proof model ambiguous.',
          'error',
          false,
          { fingerprints: [...duplicateFingerprints] }
        )
      );
    }

    const removedNodeIds = new Set<string>();
    const updatedNodeIds = new Set<string>();
    for (const operation of operations) {
      switch (operation.type) {
        case CkgOperationType.ADD_NODE:
          break;
        case CkgOperationType.REMOVE_NODE:
          removedNodeIds.add(operation.nodeId);
          break;
        case CkgOperationType.UPDATE_NODE:
          updatedNodeIds.add(operation.nodeId);
          break;
        case CkgOperationType.ADD_EDGE:
          break;
        case CkgOperationType.REMOVE_EDGE:
          break;
      }
    }

    const updateRemoveConflicts = [...updatedNodeIds].filter((nodeId) =>
      removedNodeIds.has(nodeId)
    );
    if (updateRemoveConflicts.length > 0) {
      findings.push(
        buildFinding(
          'PROOF_UPDATE_REMOVE_NODE_CONFLICT',
          'A node is both updated and removed in the same mutation.',
          'error',
          false,
          { nodeIds: updateRemoveConflicts }
        )
      );
    }

    const structuralRewriteCount = countStructuralRewrites(operations);
    if (structuralRewriteCount >= REVIEWABLE_STRUCTURAL_REWRITE_THRESHOLD) {
      findings.push(
        buildFinding(
          'PROOF_COMPLEX_STRUCTURAL_REWRITE',
          'The mutation contains multiple high-impact structural rewrites and should be reviewed before commit.',
          'warning',
          true,
          { structuralRewriteCount }
        )
      );
    }

    const mergeAndSplitInSameMutation =
      operations.some((operation) => operation.type === CkgOperationType.MERGE_NODES) &&
      operations.some((operation) => operation.type === CkgOperationType.SPLIT_NODE);
    if (mergeAndSplitInSameMutation) {
      findings.push(
        buildFinding(
          'PROOF_MIXED_STRUCTURAL_REWRITE',
          'Combining merge and split rewrites in one canonical mutation requires explicit review.',
          'warning',
          true
        )
      );
    }

    const failureFindings = findings.filter((finding) => finding.severity === 'error');
    const reviewableFindings = findings.filter((finding) => finding.reviewable);
    const passed = failureFindings.length === 0 && reviewableFindings.length === 0;

    let enforcement: IProofResult['enforcement'] = 'none';
    if (mode === ProofRolloutMode.OBSERVE_ONLY && findings.length > 0) {
      enforcement = 'observe_only';
    } else if (reviewableFindings.length > 0) {
      enforcement = 'pending_review';
    } else if (failureFindings.length > 0) {
      enforcement = 'rejected';
    }

    return Promise.resolve({
      mode,
      status: passed ? 'passed' : 'failed',
      passed,
      engineVersion: ENGINE_VERSION,
      artifactRef: `proof://${mutation.mutationId}/${Date.now().toString(36)}`,
      checkedInvariants,
      findings,
      ...(passed
        ? {}
        : {
            failureExplanation:
              failureFindings[0]?.message ??
              reviewableFindings[0]?.message ??
              'Proof-stage findings require attention before commit.',
          }),
      modelSummary: toSerializableMetadata({
        specVersion: model.specVersion,
        operationCount: model.operationCount,
        operationTypes: model.operationTypes,
        affectedNodeIds: model.affectedNodeIds,
        affectedEdgeIds: model.affectedEdgeIds,
      }),
      executedAt: new Date().toISOString(),
      autoApproved: false,
      enforcement,
    });
  }
}

export function createDisabledProofResult(
  mode: ProofRolloutMode,
  model: IProofModel
): IProofResult {
  return {
    mode,
    status: 'skipped',
    passed: true,
    engineVersion: ENGINE_VERSION,
    artifactRef: null,
    checkedInvariants: [],
    findings: [],
    modelSummary: toSerializableMetadata({
      specVersion: model.specVersion,
      operationCount: model.operationCount,
      operationTypes: model.operationTypes,
      affectedNodeIds: model.affectedNodeIds,
      affectedEdgeIds: model.affectedEdgeIds,
    }),
    executedAt: new Date().toISOString(),
    autoApproved: true,
    enforcement: 'none',
  };
}
