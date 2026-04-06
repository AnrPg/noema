---- MODULE NoemaMutationProof ----
EXTENDS Naturals, TLC

OperationCount == 1
StructuralRewriteCount == 0
CurrentNodeIds == {"node_vuBdusbUTp1UkQNuVbEGV", "node_fwgm4u6c9v6jl1hBeqE47"}
ProjectedNodeIds == {"node_fwgm4u6c9v6jl1hBeqE47", "node_vuBdusbUTp1UkQNuVbEGV"}
ProjectedNodes == {<<"node_fwgm4u6c9v6jl1hBeqE47", "concept", "skills-and-occupations", "existing">>, <<"node_vuBdusbUTp1UkQNuVbEGV", "concept", "skills-and-occupations", "existing">>}
ProjectedNodeClassifications == {<<"node_fwgm4u6c9v6jl1hBeqE47", {"knowledge_entity", "concept_bearing", "abstraction"}>>, <<"node_vuBdusbUTp1UkQNuVbEGV", {"knowledge_entity", "concept_bearing", "abstraction"}>>}
ProjectedEdges == {<<"proof:mut_baU08QLdw0aOMeGMwU1cG:edge:0:add", "is_a", "node_vuBdusbUTp1UkQNuVbEGV", "node_fwgm4u6c9v6jl1hBeqE47", "planned_add">>}
EdgeConstraintSnapshots == {<<"is_a", {"abstraction", "role_like"}, {"abstraction", "role_like"}, TRUE>>, <<"exemplifies", {"example_like", "process_like"}, {"concept_bearing"}, FALSE>>, <<"part_of", {"knowledge_entity"}, {"abstraction", "rule_like"}, FALSE>>, <<"constituted_by", {"abstraction", "process_like", "rule_like"}, {"abstraction", "fact_like", "rule_like"}, FALSE>>, <<"equivalent_to", {"concept_bearing", "role_like"}, {"concept_bearing", "role_like"}, TRUE>>, <<"entails", {"concept_bearing"}, {"concept_bearing"}, TRUE>>, <<"disjoint_with", {"concept_bearing", "skill_like"}, {"concept_bearing", "skill_like"}, TRUE>>, <<"contradicts", {"knowledge_entity"}, {"knowledge_entity"}, TRUE>>, <<"causes", {"knowledge_entity"}, {"knowledge_entity"}, FALSE>>, <<"precedes", {"concept_bearing"}, {"concept_bearing"}, TRUE>>, <<"depends_on", {"knowledge_entity"}, {"knowledge_entity"}, FALSE>>, <<"related_to", {"knowledge_entity"}, {"knowledge_entity"}, FALSE>>, <<"analogous_to", {"knowledge_entity"}, {"knowledge_entity"}, FALSE>>, <<"contrasts_with", {"knowledge_entity"}, {"knowledge_entity"}, TRUE>>, <<"confusable_with", {"skill_like"}, {"skill_like"}, TRUE>>, <<"translation_equivalent", {"concept_bearing"}, {"concept_bearing"}, TRUE>>, <<"false_friend_of", {"concept_bearing"}, {"concept_bearing"}, TRUE>>, <<"minimal_pair_with", {"concept_bearing"}, {"concept_bearing"}, TRUE>>, <<"collocates_with", {"concept_bearing"}, {"concept_bearing"}, TRUE>>, <<"prerequisite", {"concept_bearing"}, {"concept_bearing", "fact_like"}, FALSE>>, <<"derived_from", {"concept_bearing"}, {"knowledge_entity"}, FALSE>>, <<"has_property", {"concept_bearing"}, {"abstraction", "fact_like", "rule_like"}, FALSE>>, <<"governs", {"abstraction", "skill_like", "process_like"}, {"abstraction", "skill_like", "process_like"}, FALSE>>, <<"inflected_form_of", {"abstraction", "example_like"}, {"abstraction", "skill_like"}, FALSE>>, <<"subskill_of", {"skill_like"}, {"skill_like"}, TRUE>>, <<"has_subskill", {"skill_like"}, {"skill_like"}, TRUE>>, <<"essential_for_occupation", {"skill_like"}, {"role_like"}, FALSE>>, <<"occupation_requires_essential_skill", {"role_like"}, {"skill_like"}, FALSE>>, <<"optional_for_occupation", {"skill_like"}, {"role_like"}, FALSE>>, <<"occupation_benefits_from_optional_skill", {"role_like"}, {"skill_like"}, FALSE>>, <<"transferable_to", {"skill_like"}, {"skill_like", "abstraction", "process_like"}, FALSE>>}
DisjointClassPairs == {<<"concept_bearing", "instance_like">>, <<"concept_bearing", "diagnostic_like">>, <<"role_like", "concept_bearing">>, <<"role_like", "instance_like">>, <<"role_like", "diagnostic_like">>}
DuplicateFingerprints == {}
UpdateRemoveConflictNodeIds == {}
MissingEndpointWitnesses == {}
DependencyEdges == {}
DependencyCycleWitnesses == {}
BidirectionalDependencyWitnesses == {}
MutuallyExclusiveRelationWitnesses == {}
SplitAssignmentGapWitnesses == {}
OntologyViolationWitnesses == {}

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