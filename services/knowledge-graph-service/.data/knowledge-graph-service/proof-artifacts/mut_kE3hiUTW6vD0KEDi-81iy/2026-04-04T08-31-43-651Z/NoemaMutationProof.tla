---- MODULE NoemaMutationProof ----
EXTENDS Naturals, TLC

CONSTANTS OperationCount, StructuralRewriteCount
CONSTANTS CurrentNodeIds, ProjectedNodeIds, ProjectedNodes, ProjectedEdges
CONSTANTS ProjectedNodeClassifications, EdgeConstraintSnapshots, DisjointClassPairs
CONSTANTS DuplicateFingerprints, UpdateRemoveConflictNodeIds
CONSTANTS MissingEndpointWitnesses, DependencyEdges, DependencyCycleWitnesses
CONSTANTS BidirectionalDependencyWitnesses, MutuallyExclusiveRelationWitnesses
CONSTANTS SplitAssignmentGapWitnesses, OntologyViolationWitnesses

VARIABLE phase

NoDuplicateFingerprints == Cardinality(DuplicateFingerprints) = 0
NoUpdateRemoveConflicts == Cardinality(UpdateRemoveConflictNodeIds) = 0
NoMissingProjectedEndpoints == Cardinality(MissingEndpointWitnesses) = 0
NoPlaceholderProjectedNodes ==
  \A node \in ProjectedNodes: /\ node[2] # "unknown" /\ node[3] # "unknown"
AllProjectedEdgesHaveDeclaredEndpoints ==
  \A edge \in ProjectedEdges:
    /\ edge[3] \in ProjectedNodeIds
    /\ edge[4] \in ProjectedNodeIds
AllDependencyEdgesAreProjected ==
  \A dep \in DependencyEdges:
    \E edge \in ProjectedEdges:
      /\ edge[2] = dep[3]
      /\ edge[3] = dep[1]
      /\ edge[4] = dep[2]
NoDependencySelfLoops == \A edge \in DependencyEdges: edge[1] # edge[2]
NoDependencyCycles == Cardinality(DependencyCycleWitnesses) = 0
NoBidirectionalDependency == Cardinality(BidirectionalDependencyWitnesses) = 0
NoMutuallyExclusiveRelations == Cardinality(MutuallyExclusiveRelationWitnesses) = 0
NoSplitAssignmentGaps == Cardinality(SplitAssignmentGapWitnesses) = 0
NodeClasses(nodeId) ==
  LET matches == {entry \in ProjectedNodeClassifications: entry[1] = nodeId}
  IN IF matches = {} THEN {} ELSE CHOOSE entry \in matches: entry[2]
AllowedSourceClasses(edgeType) ==
  LET matches == {entry \in EdgeConstraintSnapshots: entry[1] = edgeType}
  IN IF matches = {} THEN {} ELSE CHOOSE entry \in matches: entry[2]
AllowedTargetClasses(edgeType) ==
  LET matches == {entry \in EdgeConstraintSnapshots: entry[1] = edgeType}
  IN IF matches = {} THEN {} ELSE CHOOSE entry \in matches: entry[3]
SameKindRequired(edgeType) ==
  LET matches == {entry \in EdgeConstraintSnapshots: entry[1] = edgeType}
  IN IF matches = {} THEN FALSE ELSE CHOOSE entry \in matches: entry[4]
HasAllowedClass(classes, allowed) == \E cls \in classes: cls \in allowed
PrimaryKind(classes) ==
  IF "abstraction" \in classes \/ "concept_bearing" \in classes THEN "abstraction"
  ELSE IF "role_like" \in classes THEN "role_like"
  ELSE IF "instance_like" \in classes THEN "instance_like"
  ELSE IF "diagnostic_like" \in classes THEN "diagnostic_like"
  ELSE "unknown"
HasKindAlignment(sourceClasses, targetClasses) ==
  /\ PrimaryKind(sourceClasses) # "unknown"
  /\ PrimaryKind(sourceClasses) = PrimaryKind(targetClasses)
HasDisjointPair(sourceClasses, targetClasses) ==
  \E pair \in DisjointClassPairs:
    /\ ((pair[1] \in sourceClasses) /\ (pair[2] \in targetClasses))
       \/ ((pair[2] \in sourceClasses) /\ (pair[1] \in targetClasses))
EdgeSatisfiesOntology(edge) ==
  LET sourceClasses == NodeClasses(edge[3])
      targetClasses == NodeClasses(edge[4])
      allowedSource == AllowedSourceClasses(edge[2])
      allowedTarget == AllowedTargetClasses(edge[2])
      sameKind == SameKindRequired(edge[2])
  IN /\ HasAllowedClass(sourceClasses, allowedSource)
     /\ HasAllowedClass(targetClasses, allowedTarget)
     /\ (sameKind => HasKindAlignment(sourceClasses, targetClasses))
     /\ ~(sameKind /\ HasDisjointPair(sourceClasses, targetClasses))
NoOntologyViolations ==
  /\ Cardinality(OntologyViolationWitnesses) = 0
  /\ \A edge \in ProjectedEdges: EdgeSatisfiesOntology(edge)
ProjectionContainsNodes == Cardinality(ProjectedNodeIds) > 0
ProjectionPreservesNodeShape == Cardinality(ProjectedNodes) = Cardinality(ProjectedNodeIds)

CanProve ==
  /\ OperationCount > 0
  /\ ProjectionContainsNodes
  /\ ProjectionPreservesNodeShape
  /\ NoDuplicateFingerprints
  /\ NoUpdateRemoveConflicts
  /\ NoPlaceholderProjectedNodes
  /\ NoMissingProjectedEndpoints
  /\ AllProjectedEdgesHaveDeclaredEndpoints
  /\ AllDependencyEdgesAreProjected
  /\ NoDependencySelfLoops
  /\ NoDependencyCycles
  /\ NoBidirectionalDependency
  /\ NoMutuallyExclusiveRelations
  /\ NoSplitAssignmentGaps
  /\ NoOntologyViolations
  /\ StructuralRewriteCount < 3

Init == phase = "validated"

Next ==
  \/ /\ phase = "validated"
     /\ phase' = "proving"
  \/ /\ phase = "proving"
     /\ CanProve
     /\ phase' = "proven"
  \/ /\ phase = "proving"
     /\ ~CanProve
     /\ phase' = "rejected"
  \/ /\ phase = "proven"
     /\ phase' = "committed"
  \/ /\ phase \in {"rejected", "committed"}
     /\ phase' = phase

Spec == Init /\ [][Next]_phase

InvariantCanProveBeforeCommit == phase = "committed" => CanProve
InvariantCommittedRequiresSafeModel == phase = "proven" => CanProve
InvariantNoPlaceholderProjectedNodes == NoPlaceholderProjectedNodes
InvariantProjectedEdgeEndpointsDeclared == AllProjectedEdgesHaveDeclaredEndpoints
InvariantDependencyEdgesRemainProjected == AllDependencyEdgesAreProjected
InvariantNoSemanticDependencyLoop == NoDependencySelfLoops /\ NoDependencyCycles /\ NoBidirectionalDependency
InvariantNoExclusiveRelationPair == NoMutuallyExclusiveRelations
InvariantNoDanglingProjectedEndpoint == NoMissingProjectedEndpoints
InvariantSplitAssignmentsComplete == NoSplitAssignmentGaps
InvariantProjectedOntologySafe == NoOntologyViolations
Termination == <>(phase = "committed" \/ phase = "rejected")

====