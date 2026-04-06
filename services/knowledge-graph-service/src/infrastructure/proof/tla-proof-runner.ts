import { execFile } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Logger } from 'pino';

import {
  DeterministicProofRunner,
  type IProofFinding,
  type IProofModel,
  type IProofResult,
  type IProofRunner,
  ProofRolloutMode,
} from '../../domain/knowledge-graph-service/proof-stage.js';
import type { CkgMutationOperation } from '../../domain/knowledge-graph-service/ckg-mutation-dsl.js';
import type { IExecutionContext } from '../../domain/knowledge-graph-service/execution-context.js';
import type { ICkgMutation } from '../../domain/knowledge-graph-service/mutation.repository.js';

const ENGINE_VERSION = 'noema-tla-proof-v1';
const MODULE_NAME = 'NoemaMutationProof';

interface ITlaProofRunnerOptions {
  artifactRootDirectory: string;
  tlaToolsJarPath: string | null;
  javaBinary: string;
  timeoutMs: number;
}

interface ITlaExecutionResult {
  readonly passed: boolean;
  readonly findings: readonly IProofFinding[];
  readonly checkedInvariants: readonly string[];
}

export class TlaProofRunner implements IProofRunner {
  constructor(
    private readonly options: ITlaProofRunnerOptions,
    private readonly logger: Logger,
    private readonly deterministicRunner: IProofRunner = new DeterministicProofRunner()
  ) {}

  async runProof(
    mutation: ICkgMutation,
    operations: readonly CkgMutationOperation[],
    model: IProofModel,
    context: IExecutionContext,
    mode: ProofRolloutMode
  ): Promise<IProofResult> {
    const deterministicResult = await this.deterministicRunner.runProof(
      mutation,
      operations,
      model,
      context,
      mode
    );
    const artifactDirectory = await this.prepareArtifactDirectory(mutation.mutationId);
    const tlaModule = buildTlaModule(model);
    const tlaConfig = buildTlaConfig();

    await Promise.all([
      writeFile(path.join(artifactDirectory, 'model.json'), JSON.stringify(model, null, 2), 'utf8'),
      writeFile(
        path.join(artifactDirectory, 'deterministic-findings.json'),
        JSON.stringify(deterministicResult.findings, null, 2),
        'utf8'
      ),
      writeFile(path.join(artifactDirectory, `${MODULE_NAME}.tla`), tlaModule, 'utf8'),
      writeFile(path.join(artifactDirectory, `${MODULE_NAME}.cfg`), tlaConfig, 'utf8'),
    ]);

    this.logger.debug(
      { mutationId: mutation.mutationId, artifactDirectory, mode },
      'Persisted proof-stage artifacts'
    );

    const tlaResult = await this.runTlaBackend(
      artifactDirectory,
      deterministicResult.findings,
      model,
      mode
    );

    const findings = [...deterministicResult.findings, ...tlaResult.findings];
    const enforcement = determineEnforcement(mode, findings);
    const passed =
      findings.filter((finding) => finding.severity === 'error').length === 0 &&
      findings.filter((finding) => finding.reviewable).length === 0;

    return {
      mode,
      status: passed ? 'passed' : 'failed',
      passed,
      engineVersion: ENGINE_VERSION,
      artifactRef: artifactDirectory,
      checkedInvariants: unique([
        ...deterministicResult.checkedInvariants,
        ...tlaResult.checkedInvariants,
      ]),
      findings,
      ...(!passed
        ? {
            failureExplanation:
              findings.find((finding) => finding.severity === 'error')?.message ??
              findings.find((finding) => finding.reviewable)?.message ??
              'Proof-stage findings require attention before commit.',
          }
        : {}),
      modelSummary: {
        ...deterministicResult.modelSummary,
        artifactDirectory,
      },
      executedAt: new Date().toISOString(),
      autoApproved: false,
      enforcement,
    };
  }

  private async prepareArtifactDirectory(mutationId: string): Promise<string> {
    const directory = path.resolve(
      this.options.artifactRootDirectory,
      mutationId,
      new Date().toISOString().replace(/[:.]/g, '-')
    );
    await mkdir(directory, { recursive: true });
    return directory;
  }

  private async runTlaBackend(
    artifactDirectory: string,
    deterministicFindings: readonly IProofFinding[],
    model: IProofModel,
    mode: ProofRolloutMode
  ): Promise<ITlaExecutionResult> {
    const checkedInvariants = [
      'tla.can_prove_before_commit',
      'tla.committed_requires_safe_model',
      'tla.projected_ontology_safe',
      'tla.eventual_terminal_state',
    ];

    if (this.options.tlaToolsJarPath === null) {
      return {
        passed: false,
        checkedInvariants,
        findings: [
          buildBackendUnavailableFinding(
            'TLA+ tools jar is not configured; canonical proof cannot be executed.',
            mode
          ),
        ],
      };
    }

    try {
      await access(this.options.tlaToolsJarPath);
    } catch {
      return {
        passed: false,
        checkedInvariants,
        findings: [
          buildBackendUnavailableFinding(
            `Configured TLA+ tools jar was not found at ${this.options.tlaToolsJarPath}.`,
            mode
          ),
        ],
      };
    }

    const stdoutPath = path.join(artifactDirectory, 'tlc.stdout.log');
    const stderrPath = path.join(artifactDirectory, 'tlc.stderr.log');

    try {
      const { stdout, stderr } = await execFileAsync(
        this.options.javaBinary,
        [
          '-cp',
          this.options.tlaToolsJarPath,
          'tlc2.TLC',
          '-cleanup',
          '-deadlock',
          '-workers',
          '1',
          '-config',
          `${MODULE_NAME}.cfg`,
          `${MODULE_NAME}.tla`,
        ],
        {
          cwd: artifactDirectory,
          timeout: this.options.timeoutMs,
        }
      );

      await Promise.all([
        writeFile(stdoutPath, stdout, 'utf8'),
        writeFile(stderrPath, stderr, 'utf8'),
      ]);

      return {
        passed: true,
        checkedInvariants,
        findings:
          deterministicFindings.length === 0
            ? []
            : [
                {
                  code: 'PROOF_TLA_HEURISTIC_COMPANION',
                  message:
                    'TLA+ proof completed; deterministic structural diagnostics are attached as companion findings.',
                  severity: 'warning',
                  reviewable: false,
                  metadata: {
                    deterministicFindingCount: deterministicFindings.length,
                    operationCount: model.operationCount,
                  },
                },
              ],
      };
    } catch (error) {
      const execError = normalizeExecError(error);
      await Promise.all([
        writeFile(stdoutPath, execError.stdout, 'utf8'),
        writeFile(stderrPath, execError.stderr, 'utf8'),
      ]);

      return {
        passed: false,
        checkedInvariants,
        findings: [
          {
            code: execError.timedOut ? 'PROOF_TLA_TIMEOUT' : 'PROOF_TLA_CHECK_FAILED',
            message: execError.timedOut
              ? `TLA+ proof timed out after ${String(this.options.timeoutMs)}ms.`
              : 'TLA+ proof failed; see persisted TLC artifacts for the full counterexample/output.',
            severity: 'error',
            reviewable: mode === ProofRolloutMode.SOFT_BLOCK,
            metadata: {
              exitCode: execError.code,
              signal: execError.signal,
              stdoutPath,
              stderrPath,
            },
          },
        ],
      };
    }
  }
}

function buildTlaModule(model: IProofModel): string {
  return `---- MODULE ${MODULE_NAME} ----
EXTENDS Naturals, TLC, FiniteSets

${buildTlaDefinitions(model)}

VARIABLE phase

NoDuplicateFingerprints == Cardinality(DuplicateFingerprints) = 0
NoUpdateRemoveConflicts == Cardinality(UpdateRemoveConflictNodeIds) = 0
NoMissingProjectedEndpoints == Cardinality(MissingEndpointWitnesses) = 0
NoPlaceholderProjectedNodes ==
  \\A node \\in ProjectedNodes: /\\ node[2] # "unknown" /\\ node[3] # "unknown"
AllProjectedEdgesHaveDeclaredEndpoints ==
  \\A edge \\in ProjectedEdges:
    /\\ edge[3] \\in ProjectedNodeIds
    /\\ edge[4] \\in ProjectedNodeIds
AllDependencyEdgesAreProjected ==
  \\A dep \\in DependencyEdges:
    \\E edge \\in ProjectedEdges:
      /\\ edge[2] = dep[3]
      /\\ edge[3] = dep[1]
      /\\ edge[4] = dep[2]
NoDependencySelfLoops == \\A edge \\in DependencyEdges: edge[1] # edge[2]
NoDependencyCycles == Cardinality(DependencyCycleWitnesses) = 0
NoBidirectionalDependency == Cardinality(BidirectionalDependencyWitnesses) = 0
NoMutuallyExclusiveRelations == Cardinality(MutuallyExclusiveRelationWitnesses) = 0
NoSplitAssignmentGaps == Cardinality(SplitAssignmentGapWitnesses) = 0
NodeClasses(nodeId) ==
  LET matches == {entry \\in ProjectedNodeClassifications: entry[1] = nodeId}
  IN IF matches = {} THEN {} ELSE CHOOSE entry \\in matches: entry[2]
AllowedSourceClasses(edgeType) ==
  LET matches == {entry \\in EdgeConstraintSnapshots: entry[1] = edgeType}
  IN IF matches = {} THEN {} ELSE CHOOSE entry \\in matches: entry[2]
AllowedTargetClasses(edgeType) ==
  LET matches == {entry \\in EdgeConstraintSnapshots: entry[1] = edgeType}
  IN IF matches = {} THEN {} ELSE CHOOSE entry \\in matches: entry[3]
SameKindRequired(edgeType) ==
  LET matches == {entry \\in EdgeConstraintSnapshots: entry[1] = edgeType}
  IN IF matches = {} THEN FALSE ELSE CHOOSE entry \\in matches: entry[4]
HasAllowedClass(classes, allowed) == \\E cls \\in classes: cls \\in allowed
PrimaryKind(classes) ==
  IF "abstraction" \\in classes \\/ "concept_bearing" \\in classes THEN "abstraction"
  ELSE IF "role_like" \\in classes THEN "role_like"
  ELSE IF "instance_like" \\in classes THEN "instance_like"
  ELSE IF "diagnostic_like" \\in classes THEN "diagnostic_like"
  ELSE "unknown"
HasKindAlignment(sourceClasses, targetClasses) ==
  /\\ PrimaryKind(sourceClasses) # "unknown"
  /\\ PrimaryKind(sourceClasses) = PrimaryKind(targetClasses)
HasDisjointPair(sourceClasses, targetClasses) ==
  \\E pair \\in DisjointClassPairs:
    /\\ ((pair[1] \\in sourceClasses) /\\ (pair[2] \\in targetClasses))
       \\/ ((pair[2] \\in sourceClasses) /\\ (pair[1] \\in targetClasses))
EdgeSatisfiesOntology(edge) ==
  LET sourceClasses == NodeClasses(edge[3])
      targetClasses == NodeClasses(edge[4])
      allowedSource == AllowedSourceClasses(edge[2])
      allowedTarget == AllowedTargetClasses(edge[2])
      sameKind == SameKindRequired(edge[2])
  IN /\\ HasAllowedClass(sourceClasses, allowedSource)
     /\\ HasAllowedClass(targetClasses, allowedTarget)
     /\\ (sameKind => HasKindAlignment(sourceClasses, targetClasses))
     /\\ ~(sameKind /\\ HasDisjointPair(sourceClasses, targetClasses))
NoOntologyViolations ==
  /\\ Cardinality(OntologyViolationWitnesses) = 0
  /\\ \\A edge \\in ProjectedEdges: EdgeSatisfiesOntology(edge)
ProjectionContainsNodes == Cardinality(ProjectedNodeIds) > 0
ProjectionPreservesNodeShape == Cardinality(ProjectedNodes) = Cardinality(ProjectedNodeIds)

CanProve ==
  /\\ OperationCount > 0
  /\\ ProjectionContainsNodes
  /\\ ProjectionPreservesNodeShape
  /\\ NoDuplicateFingerprints
  /\\ NoUpdateRemoveConflicts
  /\\ NoPlaceholderProjectedNodes
  /\\ NoMissingProjectedEndpoints
  /\\ AllProjectedEdgesHaveDeclaredEndpoints
  /\\ AllDependencyEdgesAreProjected
  /\\ NoDependencySelfLoops
  /\\ NoDependencyCycles
  /\\ NoBidirectionalDependency
  /\\ NoMutuallyExclusiveRelations
  /\\ NoSplitAssignmentGaps
  /\\ NoOntologyViolations
  /\\ StructuralRewriteCount < 3

Init == phase = "validated"

Next ==
  \\/ /\\ phase = "validated"
     /\\ phase' = "proving"
  \\/ /\\ phase = "proving"
     /\\ CanProve
     /\\ phase' = "proven"
  \\/ /\\ phase = "proving"
     /\\ ~CanProve
     /\\ phase' = "rejected"
  \\/ /\\ phase = "proven"
     /\\ phase' = "committed"
  \\/ /\\ phase \\in {"rejected", "committed"}
     /\\ phase' = phase

Spec == Init /\\ [][Next]_phase

InvariantCanProveBeforeCommit == phase = "committed" => CanProve
InvariantCommittedRequiresSafeModel == phase = "proven" => CanProve
InvariantNoPlaceholderProjectedNodes == NoPlaceholderProjectedNodes
InvariantProjectedEdgeEndpointsDeclared == AllProjectedEdgesHaveDeclaredEndpoints
InvariantDependencyEdgesRemainProjected == AllDependencyEdgesAreProjected
InvariantNoSemanticDependencyLoop == NoDependencySelfLoops /\\ NoDependencyCycles /\\ NoBidirectionalDependency
InvariantNoExclusiveRelationPair == NoMutuallyExclusiveRelations
InvariantNoDanglingProjectedEndpoint == NoMissingProjectedEndpoints
InvariantSplitAssignmentsComplete == NoSplitAssignmentGaps
InvariantProjectedOntologySafe == NoOntologyViolations
Termination == <>(phase = "committed" \\/ phase = "rejected")

====`;
}

function buildTlaConfig(): string {
  return `SPECIFICATION Spec
INVARIANTS InvariantCanProveBeforeCommit InvariantCommittedRequiresSafeModel
INVARIANTS InvariantNoPlaceholderProjectedNodes InvariantProjectedEdgeEndpointsDeclared
INVARIANTS InvariantDependencyEdgesRemainProjected
INVARIANTS InvariantNoSemanticDependencyLoop InvariantNoExclusiveRelationPair
INVARIANTS InvariantNoDanglingProjectedEndpoint InvariantSplitAssignmentsComplete
INVARIANTS InvariantProjectedOntologySafe
PROPERTY Termination
`;
}

function buildTlaDefinitions(model: IProofModel): string {
  return `OperationCount == ${String(model.operationCount)}
StructuralRewriteCount == ${String(model.structuralRewriteCount)}
CurrentNodeIds == ${encodeTlaSet(model.currentNodes.map((node) => encodeTlaString(node.nodeId)))}
ProjectedNodeIds == ${encodeTlaSet(model.projectedNodes.map((node) => encodeTlaString(node.nodeId)))}
ProjectedNodes == ${encodeTlaSet(
    model.projectedNodes.map((node) =>
      encodeTlaTuple([
        encodeTlaString(node.nodeId),
        encodeTlaString(node.nodeType),
        encodeTlaString(node.domain),
        encodeTlaString(node.origin),
      ])
    )
  )}
ProjectedNodeClassifications == ${encodeTlaSet(
    model.projectedNodeClassifications.map((node) =>
      encodeTlaTuple([
        encodeTlaString(node.nodeId),
        encodeTlaSet(node.classes.map((value) => encodeTlaString(value))),
      ])
    )
  )}
ProjectedEdges == ${encodeTlaSet(
    model.projectedEdges.map((edge) =>
      encodeTlaTuple([
        encodeTlaString(edge.edgeId),
        encodeTlaString(edge.edgeType),
        encodeTlaString(edge.sourceNodeId),
        encodeTlaString(edge.targetNodeId),
        encodeTlaString(edge.origin),
      ])
    )
  )}
EdgeConstraintSnapshots == ${encodeTlaSet(
    model.edgeConstraintSnapshots.map((constraint) =>
      encodeTlaTuple([
        encodeTlaString(constraint.edgeType),
        encodeTlaSet(constraint.sourceClasses.map((value) => encodeTlaString(value))),
        encodeTlaSet(constraint.targetClasses.map((value) => encodeTlaString(value))),
        constraint.sameKindRequired ? 'TRUE' : 'FALSE',
      ])
    )
  )}
DisjointClassPairs == ${encodeTlaSet(
    model.disjointClassPairs.map((pair) =>
      encodeTlaTuple([encodeTlaString(pair[0]), encodeTlaString(pair[1])])
    )
  )}
DuplicateFingerprints == ${encodeTlaSet(
    model.duplicateOperationFingerprints.map((fingerprint) => encodeTlaString(fingerprint))
  )}
UpdateRemoveConflictNodeIds == ${encodeTlaSet(
    model.updateRemoveConflictNodeIds.map((nodeId) => encodeTlaString(nodeId))
  )}
MissingEndpointWitnesses == ${encodeTlaSet(
    model.missingEndpointWitnesses.map((witness) =>
      encodeTlaTuple([
        encodeTlaString(witness.edgeId),
        encodeTlaString(witness.edgeType),
        encodeTlaSet(witness.missingNodeIds.map((nodeId) => encodeTlaString(nodeId))),
      ])
    )
  )}
DependencyEdges == ${encodeTlaSet(
    model.dependencyEdges.map((edge) =>
      encodeTlaTuple([
        encodeTlaString(edge.sourceNodeId),
        encodeTlaString(edge.targetNodeId),
        encodeTlaString(edge.edgeType),
      ])
    )
  )}
DependencyCycleWitnesses == ${encodeTlaSet(
    model.dependencyCycleWitnesses.map((witness) =>
      encodeTlaTuple([
        encodeTlaString(witness.edgeType),
        encodeTlaTuple(witness.path.map((nodeId) => encodeTlaString(nodeId))),
      ])
    )
  )}
BidirectionalDependencyWitnesses == ${encodeTlaSet(
    model.bidirectionalDependencyWitnesses.map((witness) =>
      encodeTlaTuple([
        encodeTlaString(witness.edgeType),
        encodeTlaString(witness.sourceNodeId),
        encodeTlaString(witness.targetNodeId),
      ])
    )
  )}
MutuallyExclusiveRelationWitnesses == ${encodeTlaSet(
    model.mutuallyExclusiveRelationWitnesses.map((witness) =>
      encodeTlaTuple([
        encodeTlaString(witness.leftRelation),
        encodeTlaString(witness.rightRelation),
        encodeTlaString(witness.sourceNodeId),
        encodeTlaString(witness.targetNodeId),
      ])
    )
  )}
SplitAssignmentGapWitnesses == ${encodeTlaSet(
    model.splitAssignmentGapWitnesses.map((witness) =>
      encodeTlaTuple([encodeTlaString(witness.originalNodeId), encodeTlaString(witness.edgeId)])
    )
  )}
OntologyViolationWitnesses == ${encodeTlaSet(
    model.ontologyViolationWitnesses.map((witness) =>
      encodeTlaTuple([
        encodeTlaString(witness.edgeId),
        encodeTlaString(witness.edgeType),
        encodeTlaString(witness.sourceNodeId),
        encodeTlaString(witness.targetNodeId),
        encodeTlaString(witness.reason),
      ])
    )
  )}`;
}

function encodeTlaString(value: string): string {
  return JSON.stringify(value);
}

function encodeTlaTuple(values: readonly string[]): string {
  return `<<${values.join(', ')}>>`;
}

function encodeTlaSet(values: readonly string[]): string {
  return values.length === 0 ? '{}' : `{${values.join(', ')}}`;
}

function buildBackendUnavailableFinding(message: string, mode: ProofRolloutMode): IProofFinding {
  return {
    code: 'PROOF_TLA_BACKEND_UNAVAILABLE',
    message,
    severity: 'error',
    reviewable: mode === ProofRolloutMode.SOFT_BLOCK,
  };
}

function determineEnforcement(
  mode: ProofRolloutMode,
  findings: readonly IProofFinding[]
): IProofResult['enforcement'] {
  const onlyBackendUnavailableFindings =
    findings.length > 0 &&
    findings.every((finding) => finding.code === 'PROOF_TLA_BACKEND_UNAVAILABLE');

  if (onlyBackendUnavailableFindings && mode !== ProofRolloutMode.HARD_BLOCK) {
    return 'observe_only';
  }

  if (mode === ProofRolloutMode.OBSERVE_ONLY && findings.length > 0) {
    return 'observe_only';
  }

  if (findings.some((finding) => finding.reviewable)) {
    return 'pending_review';
  }

  if (findings.some((finding) => finding.severity === 'error')) {
    return 'rejected';
  }

  return 'none';
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function execFileAsync(
  command: string,
  args: readonly string[],
  options: {
    cwd: string;
    timeout: number;
  }
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      [...args],
      {
        cwd: options.cwd,
        timeout: options.timeout,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error !== null) {
          const enrichedError = Object.assign(new Error(error.message), error, {
            stdout,
            stderr,
          });
          reject(enrichedError);
          return;
        }

        resolve({ stdout, stderr });
      }
    );
  });
}

function normalizeExecError(error: unknown): {
  code: number | string | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
} {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as {
      code?: number | string | null;
      signal?: NodeJS.Signals | null;
      stdout?: string;
      stderr?: string;
      killed?: boolean;
      message?: string;
    };

    return {
      code: candidate.code ?? null,
      signal: candidate.signal ?? null,
      stdout: candidate.stdout ?? '',
      stderr: candidate.stderr ?? candidate.message ?? '',
      timedOut: candidate.killed === true,
    };
  }

  return {
    code: null,
    signal: null,
    stdout: '',
    stderr: String(error),
    timedOut: false,
  };
}
