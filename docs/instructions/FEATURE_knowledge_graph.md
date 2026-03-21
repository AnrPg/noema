ADR-001

Dual-Graph Architecture with Foqplrmally Guarded Canonical Core

Status

Accepted

\---

Context

The platform implements a knowledge-centered, multi-agent learning system.

We require:

1\. A student-owned evolving representation of understanding.

2\. A high-integrity canonical knowledge structure.

3\. Strong semantic guarantees for canonical evolution.

4\. Epistemic flexibility for learners.

5\. Structured agent reasoning without uncontrolled mutation.

6\. Formal guardrails only where they are structurally necessary.

Previous proposals applied heavy harness enforcement globally.  
This proved over-constraining for pedagogical evolution.

We therefore separate concerns.

\---

Decision

The system shall maintain two distinct graph layers:

\---

I. Personal Knowledge Graph (PKG)

Each student maintains an individual PKG.

PKG Properties

Typed property graph

Ontology-aware (class constraints enforced)

Deterministic update API

No mutation DSL gate

No typestate enforcement

No CRDT infrastructure

No formal commit protocol modeling

Versioned

Auditable

Misconceptions represented explicitly

Processed graph summaries generated for agents

PKG Mutation Model

Updates are:

Validated against schema constraints

Checked for ontology violations

Logged

Applied directly

If violations occur:

Operation is rejected

Student receives structured explanation

PKG is pedagogically flexible but not semantically anarchic.

\---

II. Canonical Knowledge Graph (CKG)

CKG is the semantic backbone.

It is:

Crowdsourced (aggregated PKGs)

Augmented with external ontologies

Formally guarded

\---

CKG Guardrail Stack

1️⃣ Mutation DSL Gate

All CKG modifications must be expressed in a constrained mutation DSL.

No direct raw writes permitted.

\---

2️⃣ Typestate Protocol

Every mutation follows:

Proposed → Validated → Proven → Committed

Illegal state transitions are rejected.

\---

3️⃣ Ontology Verification

Every proposed mutation must:

Respect class hierarchy

Respect domain/range constraints

Preserve disjointness axioms

Preserve acyclicity where required

Respect prerequisite DAG invariants

\---

4️⃣ UNITY Invariant Framework

CKG enforces global invariants:

No circular prerequisite structures

No semantic category collapse

No contradictory classifications

No derived fact mutation

Monotonic extension of validated relations

UNITY-style invariant reasoning is used to reason about:

Persistent truths

Transient proposals

Convergence guarantees

\---

5️⃣ TLA+ Commit Modeling

The commit protocol for CKG mutations is specified in TLA+.

Properties verified:

Safety: no invariant violation reachable

Liveness: valid proposals eventually commit

No partial commit states

No inconsistent observable states

\---

6️⃣ CRDT Islands (Limited Scope)

CRDT structures are used only for:

Aggregated consensus statistics

Misconception prevalence

Confidence scoring

Non-semantic counters

Core semantic structure remains serializable and formally gated.

\---

7️⃣ Conflict Handling

If a proposed mutation conflicts with:

Existing invariant

Ontology constraint

Formal proof obligation

Then:

Mutation is rejected

Alert is generated

Conflict explanation provided

Proposal optionally queued for human review

No silent corruption.

\---

III. Interaction Between PKG and CKG

PKG never mutates CKG directly.

Instead:

1\. PKGs generate aggregated signals.

2\. Aggregation layer proposes canonical mutation candidates.

3\. DSL mutation proposal generated.

4\. CKG guardrail pipeline executes validation.

5\. If safe → commit.

6\. If unsafe → alert.

\---

IV. Reasoning Stratification

Both graphs use stratified reasoning layers:

Layer 0: Structural facts  
Layer 1: Derived logical facts  
Layer 2: Ontology classification  
Layer 3: Pedagogical metadata  
Layer 4: Misconception annotations

Derived facts are immutable.

\---

V. Agent Model

Agents:

Read PKG processed summaries

Read CKG processed summaries

Never mutate CKG directly

Propose changes via DSL only

Receive structured validation responses

Agents reason. They do not control canonical mutation.

\---

VI. Rationale

This architecture:

Preserves epistemic flexibility

Protects canonical integrity

Enables formal verification where meaningful

Avoids over-engineering student exploration

Keeps formal methods focused on semantic backbone

Scales computationally

\---

VII. Consequences

Positive

Clean separation of concerns

Formal rigor where it matters

Scalable student experimentation

Explainable canonical evolution

Strong semantic guarantees

Tradeoffs

Increased complexity in CKG layer

Requires formal spec maintenance

Requires DSL and TLA+ model upkeep

\---

VIII. Summary

PKG is exploratory and validated.

CKG is formally guarded and invariant-driven.

Mutation authority exists only within the canonical core.

Agents are reasoning entities, not mutation authorities.

\---

ADR-002

Stratified Reasoning Policy for PKG and CKG

Status

Accepted

\---

1️⃣ Context

The system contains two graphs:

PKG (Personal Knowledge Graph)

CKG (Canonical Knowledge Graph)

Both require reasoning capabilities:

Ontological inference

Rule-based derivations

Aggregated signals

Misconception detection

Curriculum analytics

Uncontrolled reasoning leads to:

Cyclic inference

Non-determinism

Hidden fact mutation

Invariant violations

Explanatory opacity

Therefore reasoning must be:

Stratified

Deterministic

Monotonic where required

Explicitly layered

\---

2️⃣ Decision

Both PKG and CKG shall use a five-layer stratified reasoning model, but with
different enforcement strength.

\---

3️⃣ Stratification Model

Reasoning layers are strictly ordered.

No rule may depend on facts derived in a higher layer.

\---

Layer 0 — Structural Base Facts

Contents:

Nodes

Edges

Edge weights

Edge types

Node attributes

Mutation Source:

PKG: direct validated updates

CKG: DSL-gated mutation only

This layer is the only layer containing mutable core structure.

\---

Layer 1 — Deterministic Graph Derivations

Examples:

Transitive closure (prerequisite)

Reachability

Cycle detection flags

Path summaries

Structural divergence metrics

Properties:

Deterministic

Computable from Layer 0 only

No mutation authority

Derived facts here are immutable.

\---

Layer 2 — Ontology Classification

Examples:

Class membership inference

Subclass relations

Domain/range constraint checks

Disjointness violations

Type propagation

Properties:

Uses Description Logic fragment

Monotonic reasoning

No recursive cross-layer dependence

CKG:

Violations block commit

PKG:

Violations trigger feedback but do not crash system

\---

Layer 3 — Aggregated & Statistical Signals

Examples:

Edge confidence (crowdsourced)

Misconnection frequencies

Mastery averages

Variance scores

Centrality metrics

Cluster membership

Properties:

Derived from Layer 0 across many PKGs

May use CRDT counters (CKG side)

No semantic mutation authority

\---

Layer 4 — Pedagogical & Diagnostic Layer

Examples:

Misconception activation states

Learner belief probabilities

Intervention suggestions

Remediation ranking

Learning path proposals

Properties:

Probabilistic

Agent-facing

No authority to mutate Layer 0

May update LearnerMisconceptionState nodes in PKG

\---

4️⃣ Cross-Layer Rules

The following constraints apply:

1\. Higher layers may depend on lower layers.

2\. Lower layers may NEVER depend on higher layers.

3\. Derived facts are immutable.

4\. Only Layer 0 is mutable.

5\. Layer 0 mutation must not depend on probabilistic Layer 4 states.

6\. No circular rule definitions across layers.

This ensures:

No reasoning oscillation

No rule self-reference

No hidden semantic mutation

\---

5️⃣ PKG Reasoning Policy

PKG reasoning:

Runs full Layer 1–4 stack

Ontology violations generate alerts

Structural inconsistencies are visible but tolerated temporarily

No DSL mutation gate

No TLA+ commit modeling

PKG is pedagogical and exploratory.

\---

6️⃣ CKG Reasoning Policy

CKG reasoning is stricter.

Layer 0 mutation is only permitted after:

Layer 1 invariant check

Layer 2 ontology validation

UNITY invariant validation

TLA+ commit protocol verification

Layer 3 uses CRDT islands for:

Aggregation counters

Consensus metrics

Layer 4 does NOT influence canonical mutation.

\---

7️⃣ UNITY Invariant Integration

UNITY invariants operate over:

Layer 0 \+ Layer 1 facts

They ensure:

No circular prerequisite chains

No contradictory classification

No semantic collapse

Preservation of domain consistency

They are evaluated before commit.

\---

8️⃣ Determinism Requirements

For CKG:

Reasoning must be deterministic

Same input → same derived graph

No time-dependent inference

No non-deterministic aggregation

For PKG:

Determinism required within a single version snapshot

\---

9️⃣ Derived Fact Immutability

Derived relations:

Transitive prerequisite

Inferred subclass

Divergence metrics

Centrality

Consensus confidence

Must never be directly mutated.

They are recomputed from base layer.

\---

🔟 Agent Interface Implications

Agents never:

Write directly to Layer 0 (CKG)

Modify derived facts

Influence invariant definitions

Agents only:

Read processed summaries

Propose DSL mutation for CKG

Update PKG via validated API

Update misconception states (Layer 4\)

\---

1️⃣1️⃣ Failure Handling

If reasoning detects:

Ontology violation (CKG)

Invariant violation (CKG)

Illegal stratification attempt

Derived fact mutation attempt

System:

Rejects mutation

Logs event

Emits alert

Preserves prior stable state

No partial commits.

\---

1️⃣2️⃣ Rationale

This stratified model:

Prevents semantic leakage

Ensures formal verifiability

Enables TLA+ modeling

Allows CRDT usage safely

Maintains explainability

Separates epistemic from structural layers

It also keeps PKG flexible while protecting CKG.

\---

1️⃣3️⃣ Consequences

Positive

Formal reasoning boundary

Clear debugging

Explainable inference

Safe canonical evolution

Pedagogical freedom in PKG

Tradeoffs

Increased reasoning orchestration complexity

Requires disciplined rule authoring

Requires invariant maintenance

\---

1️⃣4️⃣ Summary

Reasoning is layered.

Mutation authority exists only in Layer 0\.

CKG mutation requires invariant verification.

PKG mutation requires validation but not formal proof.

Derived knowledge is immutable.

Agents operate at the boundary — never at the core.

\---

ADR-003

Canonical Mutation DSL and Typestate Commit Protocol for CKG

Status

Accepted

\---

1️⃣ Context

The platform maintains:

PKG: student-owned, validated, flexible

CKG: canonical backbone, formally guarded

CKG evolves via aggregation of PKG signals \+ ontology priors. However, allowing
raw writes to CKG risks:

silent semantic corruption

non-local invariant breakage

ontology constraint violations

non-deterministic evolution

“proof after the fact” (too late)

Therefore CKG updates must be:

expressed in a constrained mutation language

validated through a typestate protocol

rejected deterministically on conflict

auditable and replayable

compatible with TLA+/UNITY reasoning

\---

2️⃣ Decision

All CKG mutations shall occur only via a CKG Mutation DSL, executed through a
strict typestate protocol:

Proposed → Validated → Proven → Committed (or Rejected)

No other pathway exists to modify CKG Layer 0\.

\---

3️⃣ Design Goals

The mutation system must guarantee:

No silent corruption: every change is explicit and bounded

Stable anchoring: change targets are unambiguous

Determinism: same proposal \+ same base state ⇒ same result

Compositionality: mutations can be batched safely

Explainability: rejection reasons are structured

Formal compatibility: maps cleanly to TLA+ and UNITY invariants

CRDT isolation: CRDTs influence only Layer 3 (stats), not Layer 0

\---

4️⃣ Mutation DSL Overview

4.1 Mutations are operations over a snapshot

A mutation references:

base_version (CKG version hash / monotonically increasing id)

operation list (bounded set of primitives)

optional preconditions (guards)

optional justifications (provenance)

If base_version ≠ current CKG head:

mutation does not apply automatically

it is re-based or rejected (policy-driven)

user/system is alerted

\---

4.2 DSL Primitive Operations (exhaustive core set)

Node operations

AddNode(node_id, type_set, properties)

UpdateNodeProps(node_id, patch) (patch is additive/replace with constraints)

RetypeNode(node_id, add_types, remove_types) (only if ontology allows)

DeprecateNode(node_id, redirect_to?) (soft-delete; maintains referential
integrity)

MergeNodes(primary_id, secondary_ids, merge_policy) (strict; preserves
provenance)

SplitNode(node_id, new_nodes\[\], rewire_policy) (rare; requires manual review
by default)

Edge operations

AddEdge(src, rel, dst, properties, weight?)

UpdateEdgeProps(src, rel, dst, patch)

RemoveEdge(src, rel, dst, reason_code)

RewireEdge(old_src, rel, old_dst, new_src, new_dst)

Constraint-aware structural ops (special)

DeclareAcyclic(relation_type) (e.g., prerequisite)

DeclareFunctional(relation_type) (at most one outgoing, etc.)

DeclareDisjoint(typeA, typeB) (ontology-level; usually not via DSL unless
curated)

Important restriction:  
No DSL operation directly edits derived layers (ADR-002). Layer 1–4 are
recomputed.

\---

4.3 Preconditions / Guards (Hoare-style)

Each operation may carry preconditions such as:

NodeExists(id)

EdgeExists(src,rel,dst)

NoCycleWouldBeIntroduced(relation_type, src, dst)

TypeAllowed(src.type, rel, dst.type)

VersionIs(base_version)

NoDisjointnessViolation(node_id, proposed_types)

ConfidenceAbove(edge, threshold) (used mainly for auto-promotion policy)

These are checked during Validate.

\---

5️⃣ Typestate Protocol

5.1 States

1\. Proposed

mutation request formed (by aggregation engine, agent proposal, or admin)

must include base_version, ops\[\], and minimal provenance

2\. Validated

schema checks pass (well-formed DSL)

referential integrity checks pass

ontology domain/range checks pass (Layer 2 constraints)

graph invariants checked (Layer 1: cycles, etc.)

stratification constraints enforced (ADR-002)

3\. Proven

UNITY invariant set evaluated on:

current base Layer 0

plus proposed delta

TLA+ model obligations satisfied for commit protocol:

safety holds

no partial-commit reachable states

(optional) fairness/liveness constraints for queue processing

any required external proofs (if configured) attached

4\. Committed

mutation applied atomically to Layer 0

new ckg_version emitted

derived layers recomputed / materialized

audit log appended

5\. Rejected

mutation rejected with structured error report

conflict surfaced as alert (UI \+ logs)

\---

5.2 State Transition Rules (hard)

Proposed → Validated: only by Validator

Validated → Proven: only by ProofCoordinator

Proven → Committed: only by Committer

Any state → Rejected: if any check fails

No skipping states

No “best effort” partial apply

\---

6️⃣ Conflict & Alert Policy

When a mutation cannot safely apply:

Conflict types

Version conflict: base_version stale

Ontology conflict: domain/range/disjointness/type violation

Invariant conflict: introduces cycle, breaks acyclicity, violates UNITY
invariant

Semantic conflict: contradicts locked canonical facts (policy-defined)

Aggregation conflict: contradicts stronger consensus / curated prior

Proof conflict: TLA+/proof obligation fails

Resolution

Reject \+ Alert by default

Optional “manual review queue” for:

merges/splits

ontology schema changes

high-impact prerequisite rewires

Alerts must include:

violated constraint name

minimal counterexample (e.g., cycle path)

implicated ops

suggested repair actions (if computable)

\---

7️⃣ CRDT Islands Integration (Scope-limited)

CRDT islands are permitted only for Layer 3 statistics:

edge frequency counters

misconception prevalence

confidence aggregation

user contribution counts

CRDT outputs may influence proposal generation, but never bypass DSL validation.

No CRDT writes modify Layer 0\.

\---

8️⃣ Provenance & Audit Requirements

Every CKG mutation must log:

mutation_id

base_version → new_version

ops list

proposer identity (agent/system/human)

evidence pointers (PKG aggregates, ontology sources)

validation outcomes

proof artifacts references (TLA+ run id, invariant set version)

This enables:

reproducibility

rollback (via inverse patch or checkpoint)

research analysis of canonical evolution

\---

9️⃣ Relationship to Agents

Agents:

can propose DSL mutations

cannot commit them

receive structured validation/proof results

Agents should be given:

processed graph summaries

plus diff previews of intended canonical effect

\---

🔟 Consequences

Positive

High integrity canonical evolution

Formal-method-friendly mutation boundary

Deterministic auditability

Clean separation from PKG flexibility

Clear alerts instead of silent drift

Tradeoffs

Higher implementation complexity in CKG

Requires maintenance of invariant library \+ proof pipeline

Potential throughput constraints (mitigated via batching \+ prioritization)

\---

1️⃣1️⃣ Summary

CKG is mutated only via a constrained DSL, executed through a strict typestate
protocol, validated by ontology \+ graph invariants, and proven against
UNITY/TLA+ obligations prior to atomic commit. Conflicts produce alerts, never
silent merges.

\---

ADR-004

Misconception Ontology and Diagnostic Engine

Status

Accepted

\---

1️⃣ Context

The platform’s core differentiator is metacognitive training: not only teaching
content, but diagnosing why learners misunderstand and guiding structural repair
of their understanding.

We maintain:

PKG: learner-owned graph reflecting current mental model

CKG: canonical backbone with formal guardrails (ADR-001..003)

Learner errors are not adequately represented as:

“wrong answer”

“missing node”

“edge mismatch vs canonical”

Because misconceptions are often:

structural (wrong prerequisite direction)

semantic (wrong categorization/type)

procedural (invalid transformation)

representational (symbol–meaning mismatch)

causal (wrong mechanism)

statistical (conditional swap, base-rate neglect)

We therefore model misconceptions as first-class semantic objects with:

explicit patterns for detection

evidence linkage

probabilistic learner state

remediation policies

crowdsourced prevalence in CKG

This must integrate with stratified reasoning (ADR-002) and CKG mutation
controls (ADR-003).

\---

2️⃣ Decision

We introduce a Misconception Ontology Layer and a Diagnostic Engine with the
following commitments:

1\. Misconceptions are represented as canonical entities in CKG (Layer 0 facts,
typed and verified).

2\. Each learner has PKG-local misconception state (Layer 4\) representing
belief/probability and resolution status.

3\. Diagnosis is performed by executing Misconception Patterns against:

PKG structure

PKG event telemetry (attempts/solutions)

processed graph summaries

CKG priors (prevalence, confusables, constraints)

4\. Misconception state never directly mutates CKG. At most it triggers:

student prompts (PKG edits)

aggregation signals

candidate DSL proposals for CKG (subject to ADR-003 pipeline)

\---

3️⃣ Misconception Ontology (CKG)

3.1 Entity Types

A) Misconception

Canonical definition of a misconception.

Required fields

misconception_id (stable)

title

domain (e.g., math, physics, stats)

misconception_type (taxonomy enum; see §3.2)

description_short

description_formal (optional, but encouraged)

canonical_refutation (counterexample / minimal disproof)

canonical_correction (what correct model looks like)

severity (minor/major/blocker)

applicability_context (optional constraints: level, prerequisites, modalities)

Optional fields

common_triggers (problem styles, representations)

related_misconceptions (co-occurrence links)

preferred_interventions (pointers)

\---

B) MisconceptionPattern

Executable detection specification(s) associated with a misconception.

Required fields

pattern_id

pattern_kind ∈ {EdgePattern, PathPattern, TypePattern, RulePattern,
AnswerPattern, TracePattern, ContextPattern}

pattern_spec (machine-readable, see §4)

signal_requirements (what data must exist)

score_model (how evidence contributes)

\---

C) Intervention

A remediation primitive or plan.

Fields

intervention_id

intervention_type ∈ {Explanation, Counterexample, Contrast, TargetedExercise,
SocraticProbe, GraphEditTask, RepresentationSwitch, PrereqRefresh}

script_template (agent prompt template)

success_criteria (how we know it worked)

expected_difficulty

recommended_spacing (for spaced repetition integration)

\---

D) Concept (existing)

Your domain nodes (skills, facts, theorems, mechanisms, etc.). Misconceptions
bind to these.

\---

3.2 Misconception Type Taxonomy (CKG enum)

The canonical misconception_type must be one of:

Structural

PrerequisiteInversion

FalsePrerequisite

MissingPrerequisite

CycleCreation

Overgeneralization

Undergeneralization

WrongPartOfHierarchy

CategoryBoundaryError

Conflation

Fragmentation

Representational

SymbolMeaningMismatch

RepresentationMappingError

UnitDimensionConfusion

SignConventionError

FrameOfReferenceError

Procedural

AlgorithmMisapplication

StepOmission

InvalidTransformation

HeuristicOveruse

Causal/Explanatory

CorrelationCausationSwap

WrongMechanism

LevelOfExplanationError

Probabilistic/Statistical

BaseRateNeglect

ConditionalDirectionSwap

IndependenceConfusion

PValueMisinterpretation

(Extensible, but additions must go through CKG DSL \+ ontology verification.)

\---

3.3 Canonical Relations (CKG edges)

MISCONCEPTION_INVOLVES(Misconception → Concept)

MISCONCEPTION_HAS_PATTERN(Misconception → MisconceptionPattern)

MISCONCEPTION_COUNTERFACT(Misconception → Concept|Relation) (optional “what it
contradicts”)

MISCONCEPTION_CO_OCCURS_WITH(Misconception ↔ Misconception) (weighted)

MISCONCEPTION_TRIGGERED_BY(Misconception → ContextNode) (optional)

MISCONCEPTION_REMEDIATED_BY(Misconception → Intervention)

INTERVENTION_TARGETS(Intervention → Concept)

All of the above live in CKG Layer 0 (facts) and are guarded by ontology
constraints.

\---

4️⃣ Pattern Specification (Executable Detectors)

Patterns must be deterministic evaluators producing:

match: boolean

score: float

evidence: refs\[\]

explanation: structured

4.1 Pattern Spec Formats (supported)

A) Graph Query Pattern (preferred)

A constrained query language (Cypher/SPARQL subset or your own mini-DSL)

Operates over processed summaries \+ PKG snapshot

Examples:

EdgePattern: PKG has edge A —prereq→ B, while CKG expects B —prereq→ A

TypePattern: PKG assigns type X, CKG ontology implies disjointness with X

B) Rule Pattern (buggy rule model)

Encodes “wrong rule” vs “correct rule”

Evaluated against solution traces (AttemptEvent steps)

C) Answer Pattern

Confusion matrix patterns across tasks

Detects stable answer transformation (e.g., conditional swap)

D) Trace Pattern

Matches step-level behaviors (e.g., illegal algebra move)

E) Context Pattern

Only triggers in certain modalities (word problems, diagrams, etc.)

\---

5️⃣ PKG Learner Misconception State (Layer 4\)

For each student s, PKG stores:

LearnerMisconceptionState

Fields

student_id

misconception_id (CKG reference)

belief ∈ \[0,1\]

status ∈ {suspected, confirmed, resolving, resolved}

first_seen_at, last_seen_at

supporting_evidence_refs\[\]

dominant_contexts\[\]

interventions_attempted\[\]

response_curve (optional: belief over time)

Relations

HAS_MISCONCEPTION(Student → LearnerMisconceptionState)

EVIDENCE_FOR(AttemptEvent → LearnerMisconceptionState)

ABOUT_CONCEPT(LearnerMisconceptionState → Concept) (optional denormalization)

PKG can update these states freely (validated), without DSL gate.

\---

6️⃣ Evidence Model (Telemetry)

AttemptEvent (PKG-local or global event store)

Fields:

attempt_id, timestamp

task_id

target_concepts\[\]

student_response

correct_response

solution_trace (optional)

hints_used, time_spent

representation_mode (text/diagram/equation)

error_features (tokenized error descriptors)

Evidence is the backbone for probabilistic diagnosis.

\---

7️⃣ Diagnostic Engine

7.1 Inputs

PKG snapshot (student graph)

PKG processed features (neighbors, paths, divergence, etc.)

AttemptEvents within a time window

CKG misconception library (misconceptions \+ patterns \+ interventions)

CKG priors:

prevalence

confusable concept pairs

concept prerequisites

7.2 Output

Ranked list of candidate misconceptions:

(misconception_id, score, evidence_refs, explanation)

Updates to LearnerMisconceptionState (belief up/down)

Recommended interventions (one or more)

7.3 Scoring (policy)

A misconception is scored via:

Pattern matches (strong signals)

Repeated evidence over time

Context gating

Co-occurrence priors

Divergence severity (PKG vs CKG)

Belief update policy:

Bayesian-style update or bounded logistic update (implementation choice)

Must be deterministic given same input snapshot (PKG version \+ event set)

\---

8️⃣ Interaction With CKG Evolution

Misconception statistics are aggregated across students into CKG Layer 3
signals:

prevalence(m)

trigger_concepts(m)

co_occurrence(m1,m2)

intervention_effectiveness(m, intervention)

CRDT islands may be used for these counters (ADR-001), but:

They do not mutate CKG semantic edges directly.

They can generate candidate DSL proposals (ADR-003) for:

adding a new misconception node

refining pattern definitions

refining intervention mapping

Such proposals must pass CKG guardrails.

\---

9️⃣ Guardrails and Constraints

CKG Constraints (hard)

Every Misconception must link to ≥1 MisconceptionPattern

Patterns must declare required signals (so evaluation is well-defined)

No pattern may require derived facts that violate ADR-002 stratification

No misconception edit bypasses DSL \+ typestate protocol

PKG Constraints (soft)

Belief values must remain in \[0,1\]

Status transitions must be legal:

suspected → confirmed → resolving → resolved

allowed regressions only with evidence (policy)

Evidence links must refer to existing AttemptEvents

\---

🔟 Consequences

Positive

Misconceptions become queryable, compositional, and explainable

Agents can diagnose causes, not only outcomes

Metacognitive signals become first-class

Crowdsourcing improves the misconception library over time

Works with your PKG freedom \+ CKG rigor split

Tradeoffs

Requires curated misconception taxonomy and pattern authoring

Needs consistent telemetry collection

Diagnostic engine must be carefully designed to avoid over-triggering

\---

1️⃣1️⃣ Summary

Misconceptions are canonical semantic objects in CKG with executable detection
patterns and linked interventions. Each student has PKG-local misconception
state updated via deterministic pattern evaluation over graph structure \+
learning telemetry. Aggregated misconception statistics inform—but never
bypass—CKG’s formal mutation pipeline.

—

ADR-005

PKG → CKG Aggregation Pipeline and Promotion Policy

Status

Accepted

\---

1️⃣ Context

We maintain two graph layers (ADR-001):

PKG: student-owned, validated, exploratory

CKG: canonical backbone, formally guarded via:

Mutation DSL gate \+ typestate protocol (ADR-003)

Ontology verification \+ UNITY invariants (ADR-001/002)

TLA+ commit protocol checks (ADR-003)

CKG evolves via:

1\. Crowdsourcing from PKGs

2\. Augmentation from external field KGs \+ ontologies

3\. Formal promotion through the CKG mutation pipeline

We must convert messy, heterogeneous, student-generated structures into safe
canonical updates without:

injecting misconceptions into canonical truth

biasing toward early adopters

losing minority but correct structures

allowing semantic drift

letting aggregation bypass formal guardrails

Therefore we define an explicit Aggregation Pipeline and Promotion Policy.

\---

2️⃣ Decision

We introduce a multi-stage pipeline:

PKG signals → Normalization → Candidate generation → Evidence scoring → Proposal
synthesis → DSL mutation proposal → Formal validation/proof → Commit or
Reject/Alert

CKG will never be mutated directly by aggregation counters; instead aggregation
emits candidate proposals only.

\---

3️⃣ Pipeline Stages (End-to-End)

Stage 0 — Inputs

Input sources

PKG snapshots (structural graph)

PKG telemetry (AttemptEvents, misconception state changes)

PKG processed summaries (optional; used for analytics)

External KGs / ontologies (Wikidata / domain ontologies / curated corpora)

Output requirements

All inputs must be versioned:

PKG version per student

CKG version baseline

ontology version

rule-set version (ADR-002)

\---

Stage 1 — Canonicalization / Normalization of PKG Signals

Purpose: map heterogeneous student content into comparable canonical
identifiers.

1.1 Entity resolution

Map student-created nodes to canonical Concept IDs where possible:

string normalization

synonym dictionary

embedding similarity

ontology alignment

1.2 Relation normalization

Map student relations to canonical relation types:

prerequisite, part_of, explains, causes, example_of, etc.

Discard or flag unknown relation labels

1.3 Type normalization

Map student types to CKG ontology types

Flag disallowed types, disjointness violations

Outputs

Normalized edges: (u, r, v, metadata)

Mapping confidence per alignment

\---

Stage 2 — Signal Extraction (Aggregation Features)

Extract candidate-relevant statistics from normalized PKGs.

2.1 Edge support

For each potential canonical edge :

Support count: support(e)

Support fraction: support(e)/N_students_seen

Support weighted by mastery: Σ mastery(s) \* I_s(e)

Support weighted by recency: decay function over time

2.2 Edge opposition

Count of students who explicitly assert conflicting edge

Count of students who omit edge despite having both nodes

2.3 Misconception correlation

If edge correlates with known misconception activation (ADR-004), lower trust

2.4 Outcome correlation

If edge presence correlates with improved success on tasks involving v, increase
trust

2.5 Ontology compatibility score

domain/range compatibility

disjointness risk

DAG/acyclic constraints for prerequisite edges

Outputs

EdgeEvidence(e) objects (see §4)

\---

Stage 3 — Candidate Generation

Produce candidate proposals of three kinds:

3.1 Structural candidates

AddEdge(u,r,v)

RemoveEdge(u,r,v) (rare; usually manual review)

RewireEdge(u,r,v → u,r,v')

RetypeNode

3.2 Concept candidates

AddNode concept (rare; requires strong evidence \+ ontology mapping)

DeprecateNode (rare; mostly curated)

3.3 Misconception library candidates (ADR-004)

Add new misconception

Add pattern / intervention links

Update prevalence priors

\---

Stage 4 — Evidence Scoring & Promotion Thresholds

Each candidate is scored with a deterministic policy.

4.1 Evidence object schema (conceptual)

For candidate :

support_score

opposition_score

mastery_weighted_support

outcome_correlation

misconception_risk

ontology_risk

external_alignment_score (agreement with field KG/ontology)

novelty_score (not redundant)

impact_score (centrality of affected nodes)

4.2 Promotion decision bands

Candidates are binned:

Band A — Auto-promotable

High support

Low opposition

Strong external alignment

Low misconception correlation

Low ontology risk

→ generates DSL mutation proposal automatically.

Band B — Review-promotable

Medium support or conflicting signals

Requires human/curator review or additional evidence tasks

→ queued with suggested experiments/questions.

Band C — Rejected/Archived

High misconception correlation

High ontology risk

Low support

→ not promoted; tracked for research.

\---

Stage 5 — DSL Proposal Synthesis (ADR-003)

For each candidate in Band A (and approved Band B):

Generate Mutation DSL operations

Include:

base_version

ops

guards (preconditions)

provenance and evidence links

Example ops:

AddEdge(u, "prerequisite", v, {confidence: 0.83})

Guard: NoCycleWouldBeIntroduced("prerequisite", u, v)

Guard: TypeAllowed(u.type, "prerequisite", v.type)

\---

Stage 6 — Formal Validation / Proof Pipeline

DSL proposals enter CKG typestate pipeline (ADR-003):

Proposed → Validated → Proven → Committed

Validation includes:

Stratified reasoning checks (ADR-002)

Ontology verification

UNITY invariants (no semantic collapse, no cycles)

TLA+ commit protocol properties

If fail:

Reject

Emit Alert \+ explanation

Candidate marked as conflicting

\---

Stage 7 — Commit and Materialization

If committed:

CKG Layer 0 updated

Derived layers recomputed

Updated processed summaries generated for agents

Aggregation stats updated (CRDT islands allowed for counters only)

\---

4️⃣ External Knowledge Integration Policy

CKG is “crowdsourced \+ field KG enhanced”.

External KG/ontology contributions are treated as priors, not absolute truth.

Integration modes

1\. Alignment prior

Increase external_alignment_score if candidate matches external KG relation

2\. Type prior

Use ontology to restrict allowed relations and types

3\. Candidate seeding

External KG suggests missing edges; PKG evidence confirms or rejects

4\. Conflict flagging

If PKG consensus contradicts external KG:

do not auto-promote

route to review band

trigger targeted diagnostic tasks to students

\---

5️⃣ Misconception-Safety Policy (Critical)

To avoid canonicalizing misconceptions:

5.1 Misconception gating

If candidate edge correlates strongly with a misconception:

demote to Band B or C automatically

attach recommended disambiguation tests

require additional evidence

5.2 “Truth by success” bias prevention

We do not promote edges only because “high-performing students do it” unless:

it aligns with ontology constraints

it improves downstream outcomes in controlled comparisons

it passes review or formal constraints

\---

6️⃣ Aggregation Storage Model

We maintain an Aggregation Evidence Store (AES):

append-only

versioned

supports recomputation

CRDT counters allowed only for:

support counts

prevalence counts

co-occurrence counts

AES is not CKG. It feeds CKG.

\---

7️⃣ Alert & Review Workflow

When candidates fail:

alert generated with:

violation type (ontology, invariant, stale base, proof fail)

minimal counterexample (cycle path, disjointness proof)

implicated ops

suggested resolution

Review queue supports:

curator actions

targeted learner probes

experiments to increase evidence quality

\---

8️⃣ Consequences

Positive

Scalable crowdsourcing into a formally guarded canonical KG

Prevents naive “majority vote” errors

Integrates field KGs as priors safely

Keeps formal guardrails un-bypassed

Produces explainable canonical evolution

Tradeoffs

Requires robust normalization/entity resolution

Requires evidence model \+ scoring governance

Needs curator tooling for Band B

\---

9️⃣ Summary

PKG data is normalized into candidate updates, scored using deterministic
evidence policy, optionally aligned with external KGs/ontologies, and promoted
only via DSL proposals through the formal CKG validation \+ proof pipeline.
Conflicts trigger alerts and review—never silent merge.

\---

ADR-006

TLA+ Commit Model Scope, Properties, and Verification Artifacts for CKG

Status

Accepted

\---

1️⃣ Context

CKG (Canonical Knowledge Graph) is:

Formally guarded (ADR-001)

Stratified (ADR-002)

Mutated only via DSL \+ typestate protocol (ADR-003)

Fed by aggregation pipeline (ADR-005)

We decided:

Formal guardrails apply only to CKG

PKG remains validated but not formally modeled

CKG commits must satisfy safety and structural invariants

Conflicts must generate alerts, never silent corruption

TLA+ is used to formally model and verify the commit protocol, not the entire
platform.

\---

2️⃣ Decision

We define a restricted formal verification scope for CKG:

TLA+ will model:

1\. Mutation typestate machine

2\. Invariant preservation

3\. Atomic commit semantics

4\. Version monotonicity

5\. No partial state exposure

6\. Deterministic state evolution

TLA+ will NOT model:

Full ontology reasoning engine

Misconception probabilistic logic

Aggregation scoring heuristics

External KG alignment logic

PKG operations

Formal scope is tightly bounded to mutation boundary and invariant enforcement.

\---

3️⃣ What Exactly Is Modeled in TLA+

\---

3.1 State Variables

The abstract CKG model includes:

Nodes

Edges

Version

PendingMutations

CommittedHistory

InvariantSet

OntologyConstraints

DerivedFacts (modeled abstractly, not fully expanded)

All state transitions are functions over these variables.

\---

3.2 Mutation Representation (Abstracted)

Each mutation is modeled as:

Mutation \==  
 \[ baseVersion : Version,  
 ops : Seq(Operation),  
 status : {Proposed, Validated, Proven, Committed, Rejected} \]

Operations are abstracted into:

AddNode

AddEdge

RemoveEdge

UpdateNode

RetypeNode

etc.

We do NOT model full property payloads—only structure and constraint impact.

\---

3.3 State Machine (Typestate Protocol)

Transitions:

1\. Propose

2\. Validate

3\. Prove

4\. Commit

5\. Reject

No transition may skip a state.

This typestate machine is modeled explicitly in TLA+.

\---

4️⃣ Invariants Verified in TLA+

We verify safety invariants.

\---

4.1 Structural Invariants

I1: Acyclic prerequisite relation

For relation type prerequisite:

NoCycle \==  
 ∀ path : IsPath(path, prerequisite) ⇒  
 path\[1\] ≠ path\[Len(path)\]

I2: Domain/Range consistency

For each edge (u, r, v):

DomainRangeOK \==  
 Type(u) ∈ Domain(r)  
 ∧ Type(v) ∈ Range(r)

I3: Disjointness preservation

If types A and B are disjoint:

¬∃ n ∈ Nodes : Type(n) \= A ∧ Type(n) \= B

\---

4.2 Mutation Safety Invariants

I4: No partial commit visibility

It must never be the case that:

some operations in mutation applied

others not applied

Formally: Commit is atomic.

\---

I5: Version monotonicity

Version increases strictly on commit

No rollback without explicit revert operation.

\---

I6: Deterministic evolution

Given:

same initial state

same mutation sequence

Resulting state must be identical.

\---

4.3 Stratification Preservation (ADR-002)

Derived facts (Layer 1–4) are functions of Layer 0\.

We verify:

No mutation directly modifies derived layers

Derived layers recomputed from base only

\---

5️⃣ Liveness Properties

We verify bounded liveness:

L1: Valid mutation eventually commits or rejects

No infinite “Validated” or “Proven” limbo.

L2: No deadlock in mutation queue

Multiple pending mutations do not deadlock the system.

We do NOT model:

fairness across external user inputs

network failures

real distributed transport

This is a logical liveness model, not infrastructure-level.

\---

6️⃣ UNITY Framework Alignment

UNITY reasoning is used to express invariants in a compositional way:

Persistent truths (always hold)

Transient properties (during mutation)

Leads-to relations

In TLA+ this corresponds to:

Safety invariants

Temporal leads-to properties

Absence of undesirable states

UNITY provides the conceptual invariant decomposition. TLA+ provides the
executable model checking.

\---

7️⃣ Proof Artifacts

Each TLA+ spec must produce:

CKGCommit.tla

CKGCommit.cfg

Model checker output (TLC run log)

Invariant check report

State space summary

For each invariant:

Counterexample traces (if violated)

Minimal failing mutation example

These artifacts are:

Versioned

Tied to DSL schema version

Required before deployment of DSL changes

\---

8️⃣ What Is NOT Formally Modeled

To prevent overreach:

We explicitly exclude:

Misconception scoring updates

Aggregation heuristics

Student belief state evolution

CRDT counter internals

External ontology correctness

Semantic truth of domain knowledge

Formal verification protects:

\> Structural integrity of canonical graph evolution.

Not epistemic correctness of content.

\---

9️⃣ Conflict Handling in Formal Context

If TLA+ detects invariant violation:

Mutation is automatically rejected

Alert includes:

violated invariant name

minimal counterexample

mutation ID

If invariant set changes:

TLA+ spec must be re-run before enabling new DSL operations

\---

🔟 Consequences

Positive

Canonical graph cannot drift structurally

No partial commit states

Reproducible evolution

Clear separation of safety vs epistemic correctness

Formal boundary around mutation core

Tradeoffs

Requires maintenance of abstract model

Abstraction must remain aligned with real DSL

Model complexity must remain bounded

\---

1️⃣1️⃣ Summary

TLA+ is used narrowly and precisely to verify the CKG commit protocol and
invariant preservation. It models mutation state transitions, atomic commit
behavior, structural invariants, and determinism. It does not attempt to prove
epistemic truth or pedagogical logic.

Formal verification guards structure, not knowledge content.

\---

ADR-007

Agent–Graph Interaction Contract (Operational & Formal Boundary)

Status

Accepted

\---

1️⃣ Context

We now have:

ADR-001: Dual graph architecture (PKG flexible, CKG formally guarded)

ADR-002: Stratified reasoning model

ADR-003: CKG Mutation DSL \+ typestate protocol

ADR-004: Misconception ontology \+ diagnostic engine

ADR-005: PKG→CKG aggregation pipeline

ADR-006: TLA+ verification scope for CKG commit protocol

What remains undefined is the precise operational boundary between agents and
the graph system.

Agents:

Diagnose misconceptions

Propose interventions

Suggest graph edits

Suggest canonical updates

Reason over processed graph summaries

But agents must:

Never bypass DSL gate

Never mutate derived layers

Never violate stratification

Never become mutation authorities

Remain explainable and auditable

This ADR defines the Agent–Graph Interaction Contract.

\---

2️⃣ Decision

Agents shall operate strictly as:

\> Read-Only Observers of CKG  
Read-Write (Validated) Participants in PKG  
Proposal Generators for CKG  
Diagnostic and Pedagogical Controllers

They shall never:

Mutate CKG Layer 0 directly

Bypass DSL \+ typestate protocol

Modify invariants

Modify ontology schema

Alter derived layers

Access raw commit internals

All agent–graph interactions must pass through explicit, typed interfaces.

\---

3️⃣ Agent Capability Model

We define four capability classes.

\---

3.1 Capability A — Read Access

Agents may read:

From PKG

Structural base facts (Layer 0\)

Derived features (Layer 1–4)

LearnerMisconceptionState

AttemptEvents

Processed summaries

From CKG

Structural base facts (Layer 0\)

Derived canonical facts

Misconception ontology

Intervention library

Aggregated statistics (Layer 3\)

Invariant summaries (read-only)

Agents never read:

Pending mutation queue

Internal TLA+ proof artifacts

In-progress commit states

\---

3.2 Capability B — PKG Mutation (Validated API)

Agents may perform:

AddNode

AddEdge

RemoveEdge

UpdateNodeProps

Update LearnerMisconceptionState

Append AttemptEvent

BUT:

All operations must pass PKG validation layer

Ontology constraints enforced

Schema constraints enforced

Violations produce structured rejection

No DSL gate required for PKG.

\---

3.3 Capability C — CKG Proposal

Agents may:

Generate CKG Mutation DSL proposals

Attach justification

Attach evidence references

Attach suggested guards

Agents may not:

Commit mutation

Skip validation

Override rejection

Modify invariants

Force merge

All CKG proposals enter typestate pipeline (ADR-003).

\---

3.4 Capability D — Diagnostic & Pedagogical Control

Agents may:

Evaluate misconception patterns (ADR-004)

Update learner belief states

Trigger interventions

Propose PKG repair tasks

Suggest reflection prompts

Recommend targeted exercises

Suggest KG-edit tasks for learner

Agents are pedagogical orchestrators.

They are not semantic authorities.

\---

4️⃣ Explicit Non-Capabilities

Agents are forbidden from:

1\. Writing directly to CKG storage

2\. Modifying Layer 1–4 derived facts

3\. Altering invariant definitions

4\. Altering ontology schema

5\. Modifying TLA+ spec

6\. Accessing raw mutation internals

7\. Triggering partial commits

8\. Changing version numbers

9\. Overriding conflict alerts

This must be enforced at system boundary, not merely by convention.

\---

5️⃣ Interaction Interfaces

We define three explicit APIs.

\---

5.1 PKG API (Validated)

PKG.Update(operation)  
→ {Accepted | Rejected, Reason}

All operations:

deterministic

atomic

validated

\---

5.2 CKG Proposal API

CKG.Propose(mutationDSL)  
→ {Queued | Rejected (syntax/guard failure)}

This only enters typestate pipeline.

\---

5.3 Graph Query API (Processed)

Agents query via structured, bounded calls:

Graph.Query(node_id, feature_set)  
→ ProcessedGraphSummary

Agents never receive raw full graph dumps by default.

Processed summaries include:

neighbors

k-hop summaries

divergence metrics

centrality

ontology types

misconception priors

This prevents:

context overflow

accidental reasoning drift

unpredictable LLM behavior

\---

6️⃣ Agent Reasoning Constraints

Agents must reason over:

Deterministic snapshots

Version-tagged graph states

All agent actions must include:

graph_version reference

student_id reference (if PKG)

evidence IDs (if diagnostic update)

This ensures:

reproducibility

debuggability

rollback feasibility

\---

7️⃣ Explainability Requirement

Every agent-initiated graph mutation or proposal must include:

Natural-language justification

Structured reasoning trace

Evidence references

Involved concepts

Affected invariants (if CKG proposal)

This supports:

student trust

curator audit

research transparency

\---

8️⃣ Version & Snapshot Discipline

Agent actions must specify:

pkg_version (for PKG writes)

ckg_version (for CKG proposals)

If stale:

PKG writes may auto-rebase (policy)

CKG proposals must revalidate against new version

No silent application against changed base.

\---

9️⃣ Safety Model

Safety is enforced at three layers:

1\. API-level validation

2\. CKG typestate pipeline

3\. TLA+ invariant verification

Agents cannot bypass any layer.

Even adversarial or hallucinating agents cannot corrupt CKG.

\---

🔟 Concurrency & Multi-Agent Interaction

If multiple agents:

PKG writes: last-write-wins with validation (or OCC if configured)

CKG proposals: serialized in mutation queue

No concurrent CKG commit allowed

This keeps canonical core serializable and formally safe.

\---

1️⃣1️⃣ Design Rationale

This contract achieves:

Pedagogical freedom (PKG)

Formal semantic safety (CKG)

Agent empowerment without authority

Clear mutation boundaries

Explainability and auditability

Separation of epistemic and structural power

\---

1️⃣2️⃣ Consequences

Positive

Agents are powerful but sandboxed

CKG integrity cannot be violated

PKG remains exploratory

Formal methods remain meaningful

Misconception modeling integrates cleanly

Tradeoffs

Requires disciplined API enforcement

Slightly more latency for canonical updates

Requires careful interface design

\---

1️⃣3️⃣ Summary

Agents are reasoning and pedagogical entities.  
They may read widely, write locally (PKG), and propose globally (CKG).  
They are never mutation authorities for canonical knowledge.  
All canonical evolution passes through DSL \+ typestate \+ formal verification.

\---

ADR-008

Explainability and Counterfactual Trace Model (XAI for Learning \+ Graph \+
Agents)

Status

Accepted

\---

1️⃣ Context

We have a multi-agent learning platform where:

PKG reflects each student’s evolving mental model

CKG is canonical, formally guarded

Agents diagnose misconceptions, propose interventions, and may propose CKG
updates

We explicitly forbid opaque “agent magic” and silent structural changes

For a learning/metacognition product, explainability is not optional. We need:

Student-facing explanations that build insight (not just “because model said
so”)

Curator-facing auditability (why did an agent propose this canonical change?)

Research-facing traceability (how did beliefs evolve? what worked?)

We also need explanations that remain valid under:

stratified reasoning (ADR-002)

agent contract boundary (ADR-007)

CKG DSL/typestate and verification pipeline (ADR-003/006)

\---

2️⃣ Decision

We introduce a Trace Framework that is:

1\. Versioned (bound to PKG/CKG snapshot versions)

2\. Layer-aware (respects ADR-002 stratification)

3\. Evidence-linked (references telemetry and graph facts)

4\. Counterfactual-capable (supports “what would change if X were different?”)

5\. User-safe (student-facing traces are distilled; raw internal traces are not
shown)

We formalize two distinct artifacts:

Decision Trace: why an agent produced an action/output

Counterfactual Trace: what minimal changes would alter that decision

\---

3️⃣ Key Concepts

3.1 Trace Frame

A Trace Frame is a structured explanation unit.

Each agent action emits one or more Trace Frames. Frames are composable.

Frame fields (required)

frame_id

action_type (see §4)

subject (student_id, node_id, misconception_id, etc.)

inputs (refs to graph summaries / event ids; NOT raw dumps)

reasoning_steps (structured, bounded)

evidence_refs\[\] (AttemptEvents, edges, patterns matched)

assumptions\[\] (explicit)

outputs (what was decided/proposed)

confidence (0..1)

version_bindings (pkg_version, ckg_version, ontology_version, rule_version)

Frame fields (optional)

rejected_alternatives\[\] (top-2/3)

counterfactuals\[\] (see §6)

safety_checks\[\] (what guardrails were applied)

user_explanation (student-facing distilled summary)

\---

3.2 Trace Stack (Multi-frame)

Agent actions often require multiple frames:

Example:

Frame A: Misconception detection

Frame B: Intervention selection

Frame C: PKG edit suggestion

Frame D: (optional) CKG proposal generation

Frames reference each other via depends_on_frame_ids\[\].

\---

4️⃣ Action Types (Trace Coverage)

Every agent action must fall into one of these action types, each with required
trace content.

1\. DiagnoseMisconception

2\. UpdateLearnerBelief

3\. RecommendIntervention

4\. AskSocraticQuestion

5\. SuggestPKGEdit

6\. ApplyPKGEdit (if agent is allowed to apply via validated API)

7\. ProposeCKGMutationDSL

8\. RejectOperation (when validation fails)

9\. RequestHumanReview

10\. GenerateLearningPath

11\. GenerateSpacedRepetitionPlan

\---

5️⃣ Layer-Aware Explainability (ADR-002 compliant)

Trace steps must be tagged by reasoning layer:

L0: structural facts (nodes/edges)

L1: deterministic derivations (paths, closures)

L2: ontology/classification results

L3: aggregate stats (confidence, prevalence)

L4: pedagogical/diagnostic inference (probabilistic)

Hard rule:

A trace may cite higher-layer conclusions, but must include the lower-layer
basis.

No action may claim a reason without linking to its supporting layer outputs.

This prevents hand-wavy explanations like “the model thinks so”.

\---

6️⃣ Counterfactual Trace Model

We require counterfactuals for the actions where they’re meaningful:

misconception diagnosis

intervention choice

PKG edit suggestion

CKG mutation proposal

6.1 Counterfactual Object

A counterfactual is a minimal perturbation that flips (or significantly changes)
a decision.

Fields:

cf_id

target_decision (what decision it affects)

minimal_change_set\[\] (small set of changed facts/signals)

expected_new_outcome

plausibility (0..1) — is it realistic?

cost (low/medium/high) — effort required to change

why_it_matters (human-friendly)

Examples:

“If the student correctly answers 2 more conditional probability problems
without swapping P(A|B), belief in ConditionalDirectionSwap drops below 0.3 and
the intervention changes from Contrast → Practice.”

“If edge A→B (prerequisite) is removed from PKG, the shortest path changes and
the diagnosed structural misconception no longer triggers.”

6.2 Minimality Policy

We define minimality in this order:

1\. fewer elements in change set

2\. lower-cost changes preferred

3\. changes closer to observed evidence (directly testable)

This makes counterfactuals actionable (not philosophical).

\---

7️⃣ Student-Facing vs Curator-Facing Explanations

7.1 Student-Facing (Distilled)

Students see:

the “why” in plain language

1–3 key evidence points

1 corrective suggestion

1 counterfactual prompt (“If you can do X, this will stop being a problem”)

Students do NOT see:

internal scoring formulas

full evidence lists

system priors that could bias behavior (“most students fail this” phrasing is
used carefully)

7.2 Curator/Developer-Facing (Full)

Curators see full trace:

pattern matches

scores

evidence references

invariant checks

DSL proposal details (for CKG)

\---

8️⃣ Explainability for CKG Mutation Proposals (Special Requirement)

When an agent or admin user proposes a CKG DSL mutation, the trace must include:

Evidence provenance:

aggregated PKG support

external ontology/KG alignment (if used)

Risk assessment:

ontology risk score

misconception correlation risk

predicted invariant sensitivity (e.g., cycle risk)

Guards attached:

“NoCycleWouldBeIntroduced”

“TypeAllowed”

Expected impact:

which derived facts likely change (paths, closures)

Counterfactuals:

“If support falls below X” or “if conflict edges appear”, proposal would be
demoted or rejected

This makes CKG evolution explainable and auditable.

\---

9️⃣ Trace Storage and Queryability

We store traces as an append-only Trace Log, with:

indexing by:

student_id

concept_id

misconception_id

action_type

time range

pkg_version / ckg_version

immutable trace records

references to evidence objects (AttemptEvents, graph versions)

Traces must be:

replayable (given same snapshots and evidence set)

comparable across time (to analyze drift and intervention efficacy)

\---

🔟 Privacy and Safety Controls

Student trace views must redact:

other students’ data

population prevalence unless aggregated safely

internal rule IDs (optional)

Provide “explainability budget”:

avoid overwhelming students

show only the most pedagogically relevant details

\---

1️⃣1️⃣ Consequences

Positive

Strong metacognitive training capability

Auditability of agent actions

Debuggable system behavior

Research-grade trace dataset

Counterfactuals become actionable learning levers

Tradeoffs

Additional engineering (trace schemas, storage, indexing)

Must prevent trace bloat

Must design good student-facing distillation

\---

1️⃣2️⃣ Summary

We implement a versioned Trace Framework producing structured, layer-aware
Decision Traces plus Counterfactual Traces for key agent actions. Explanations
are dual-mode: distilled for students, complete for curators. This aligns with
stratified reasoning and preserves canonical integrity.

\---

ADR-009

Failure Modes, Recovery, and Rollback Policy

Status

Accepted

\---

1️⃣ Context

We now have a fully layered system:

PKG (flexible, validated)

CKG (formally guarded via DSL \+ typestate \+ TLA+)

Stratified reasoning (ADR-002)

Misconception engine (ADR-004)

Aggregation pipeline (ADR-005)

Explainability & trace framework (ADR-008)

The remaining critical question:

\> What happens when things go wrong?

In a system with:

probabilistic diagnosis

formal canonical guardrails

crowdsourced aggregation

multi-agent proposals

versioned snapshots

DSL commit pipeline

Failure is inevitable.

We must define:

What types of failures exist

How they are detected

How they are contained

How the system recovers

When rollback is allowed

What cannot be rolled back

What is considered catastrophic

This ADR formalizes the failure taxonomy and recovery strategy.

\---

2️⃣ Decision

We define:

1\. Failure Classification

2\. Detection Mechanisms

3\. Containment Boundaries

4\. Rollback Policy

5\. Degradation Modes

6\. Human Escalation Protocol

7\. Formal Safety Guarantees

Failures are treated differently depending on whether they affect:

PKG

CKG

Aggregation layer

Diagnostic layer

Explainability layer

Infrastructure layer

\---

3️⃣ Failure Taxonomy

\---

Category A — PKG Failures (Local, Recoverable)

A1 — Validation Failure

Ontology violation

Schema violation

Illegal edge type

Version mismatch

Handling:

Reject operation

Emit structured error

No rollback required (nothing committed)

\---

A2 — Diagnostic Misclassification

False positive misconception

False negative

Incorrect intervention suggestion

Handling:

Update LearnerMisconceptionState via new evidence

Trace correction

No rollback of graph

Confidence adjusted

PKG diagnostic mistakes are epistemic, not structural failures.

\---

A3 — Inconsistent Student Graph

Temporary cycle in prerequisite

Fragmented hierarchy

Structural divergence from canonical

Handling:

Alert student

Offer repair suggestion

No forced rollback

Preserve student autonomy

\---

Category B — CKG Mutation Failures (Guarded)

\---

B1 — DSL Syntax Failure

Malformed mutation proposal

Handling:

Reject at Proposed → Rejected

Log trace

No side effects

\---

B2 — Validation Failure

Domain/range violation

Disjointness violation

Cycle introduction

Stratification violation

Handling:

Reject at Validated → Rejected

Alert with minimal counterexample

No rollback (nothing committed)

\---

B3 — Proof Failure (TLA+ / UNITY)

Invariant violation discovered

Commit model inconsistency

Handling:

Reject at Proven → Rejected

Log failing invariant

Preserve previous canonical version

\---

B4 — Commit Atomicity Failure (Critical)

This must be impossible under correct implementation.

If detected:

Immediately halt canonical mutation pipeline

Freeze new proposals

Enter Degraded Mode (see §6)

Alert system administrator

Restore from last consistent snapshot

This is considered Critical Structural Failure.

\---

Category C — Aggregation Failures

\---

C1 — Majority Bias Error

High support for incorrect structure

Detection:

High misconception correlation

External ontology conflict

Performance degradation after promotion

Handling:

Flag candidate as Band B

Require targeted evidence tasks

Human review required

\---

C2 — Entity Resolution Drift

Incorrect canonical mapping

Handling:

Recompute normalization

Demote affected proposals

Correct mapping tables

No CKG rollback unless committed change occurred

\---

Category D — Diagnostic Engine Failures

\---

D1 — Pattern Overfitting

Misconception triggered too aggressively

Handling:

Adjust pattern thresholds

Recalibrate scoring

Update pattern version

No structural rollback

\---

D2 — Intervention Misfire

Intervention worsens outcome

Handling:

Log outcome

Decrease intervention effectiveness score

Reweight in future selection

No graph rollback

\---

Category E — Explainability Failure

\---

E1 — Trace Inconsistency

Trace does not match action

Missing evidence references

Handling:

Flag action as non-explainable

Disable agent capability until fixed

Treat as software bug

No structural rollback

\---

Category F — Infrastructure Failure

\---

F1 — Snapshot Corruption

PKG or CKG storage corruption

Handling:

Restore from last checkpoint

Replay valid commit log

Validate invariants post-restore

\---

F2 — Version Drift

CKG version mismatch between services

Handling:

Halt mutation pipeline

Re-synchronize state

Validate invariants

\---

4️⃣ Rollback Policy

Rollback is allowed only under specific conditions.

\---

4.1 PKG Rollback

Allowed:

Per-student

Snapshot-based

Used for undo

Used for debugging

Does not affect CKG.

\---

4.2 CKG Rollback

Rollback allowed only if:

Commit atomicity failure

Storage corruption

Proven invariant violation discovered post-commit

Critical schema error

Rollback is executed via:

Version revert to last known-good

Re-run invariant validation

Recompute derived layers

Issue global alert

Rollback must be rare and logged as severe event.

\---

4.3 No Rollback Cases

We do NOT rollback for:

Incorrect pedagogical advice

Misdiagnosed misconception

Low-quality intervention

Aggregation noise

Statistical misestimation

These are epistemic errors, not structural violations.

\---

5️⃣ Containment Boundaries

The architecture ensures:

PKG failures never propagate to CKG directly

Aggregation failures cannot bypass DSL gate

Agent hallucinations cannot corrupt canonical structure

Derived layer corruption cannot alter base layer

Formal boundary is at:

CKG Layer 0 mutation interface

Everything above can fail safely.

\---

6️⃣ Degraded Modes

In severe failures:

\---

Mode 1 — CKG Freeze Mode

Disable new DSL proposals

Continue read-only access

PKGs unaffected

Diagnostics continue

Aggregation paused

\---

Mode 2 — Aggregation Pause Mode

Stop promotion to CKG

Continue PKG collection

Continue diagnostics

Review candidates manually

\---

Mode 3 — Diagnostic Safe Mode

Disable automated misconception updates

Continue structural PKG updates

Enable only curated interventions

\---

Mode 4 — Full Canonical Recovery Mode (Rare)

Freeze CKG

Restore last stable snapshot

Re-run invariants

Resume gradually

\---

7️⃣ Monitoring & Detection Signals

The system must continuously monitor:

Invariant violation rate

Mutation rejection rate

Proposal conflict rate

Misconception false-positive drift

Intervention success degradation

CKG structural divergence rate

Entity resolution instability

Version mismatch events

Thresholds trigger alerts or degraded mode.

\---

8️⃣ Safety Guarantees

Given correct implementation of:

DSL gate

Typestate protocol

TLA+ commit model

Atomic commit semantics

We guarantee:

1\. No silent canonical corruption

2\. No partial commit state

3\. No invariant violation in committed CKG

4\. No derived layer mutation

5\. PKG experimentation cannot damage CKG

6\. Agent hallucination cannot bypass mutation gate

This is the formal safety boundary of the system.

\---

9️⃣ Consequences

Positive

Clear separation of epistemic vs structural failures

Controlled recovery paths

Strong canonical integrity

Localized failure containment

Supports research transparency

Tradeoffs

Requires monitoring infrastructure

Requires checkpointing discipline

Adds operational complexity

\---

🔟 Summary

Failures are categorized by structural impact.  
Only structural CKG violations justify rollback.  
Most failures are epistemic and corrected via updated evidence.  
Formal boundaries prevent catastrophic corruption.  
Degraded modes preserve learning continuity.

\---

ADR-010

Performance & Scaling Strategy (Graph \+ Reasoning \+ Agents)

Status

Accepted

\---

1️⃣ Context

The architecture now includes:

Dual graph system (PKG \+ CKG)

Stratified reasoning (5 layers)

Misconception diagnostic engine

Aggregation pipeline

DSL \+ typestate \+ TLA+ guarded canonical commits

Trace \+ counterfactual framework

Failure containment and rollback policy

This system is:

Computationally heavy (graph operations, inference, scoring)

State-rich (per-student PKGs \+ canonical CKG)

Event-heavy (AttemptEvents, traces)

Agent-interactive (LLM-driven reasoning)

Formally guarded (CKG mutation pipeline)

If not carefully designed, it will:

Become latency-heavy

Become memory-bound

Overcompute derived layers

Suffer from trace explosion

Create commit bottlenecks

Fail to scale with student growth

This ADR defines the scaling model and performance architecture.

\---

2️⃣ Design Goals

We optimize for:

1\. Low-latency student interaction

2\. High-integrity canonical updates

3\. Efficient derived feature computation

4\. Scalable per-student PKG isolation

5\. Controlled CKG mutation throughput

6\. Bounded trace growth

7\. Agent inference efficiency

We explicitly accept:

Slight latency in canonical promotion

Heavy verification cost for CKG (infrequent)

Batch processing for aggregation

\---

3️⃣ System Separation (Critical for Scaling)

We isolate performance domains.

\---

3.1 PKG Scaling Model

Each student PKG is:

Logically isolated

Versioned

Small relative to CKG

Frequently accessed

Scaling strategy:

Store PKGs in partitioned graph shards (by student_id)

Keep PKGs memory-hot (active students only)

Use snapshot \+ delta storage model:

Base snapshot

Incremental deltas

Derived layers computed on-demand or incrementally cached

PKG operations must remain \<100ms at 95th percentile.

\---

3.2 CKG Scaling Model

CKG is:

Globally shared

Mutated infrequently

Large but relatively stable

Strategy:

Separate read-replica cluster for query

Single commit authority node (or consensus group)

Batch DSL proposals

Precompute derived layers incrementally

Cache processed graph summaries for common concepts

CKG commit latency can be seconds — not student-blocking.

\---

4️⃣ Derived Layer Computation Strategy

We avoid recomputing entire graph on each mutation.

\---

Layer 1 (Deterministic Graph Derivations)

Examples:

Transitive closure

Reachability

Cycle detection

Shortest path summaries

Strategy:

Maintain incremental closure tables

On AddEdge:

update closure only for affected nodes

On RemoveEdge:

recompute local subgraph only

Avoid global recomputation.

\---

Layer 2 (Ontology Inference)

Strategy:

Use DL-lite / tractable subset

Precompute classification indexes

Incrementally update type propagation

Avoid full OWL-DL reasoning in runtime loop

\---

Layer 3 (Aggregation Stats)

Strategy:

CRDT-based counters (eventually consistent)

Windowed aggregation (time buckets)

Asynchronous batch recomputation

No blocking canonical reads

\---

Layer 4 (Misconception & Diagnostic)

Strategy:

Evaluate patterns lazily per student

Cache top-k candidate misconceptions

Re-evaluate only on:

new AttemptEvent

relevant PKG structural change

Use incremental scoring update

Never recompute full misconception space per interaction.

\---

5️⃣ Agent Performance Strategy

Agents must not:

Receive raw large graphs

Perform full graph traversals

Recompute centrality metrics

Agents receive:

Preprocessed, bounded graph summaries

Max token-size constrained responses

Structured feature bundles

Agent invocation policy:

Trigger only on:

new student event

misconception threshold crossing

explicit student request

Debounce repeated triggers

LLM calls are expensive — must be minimal and structured.

\---

6️⃣ Aggregation Pipeline Scaling

Aggregation (PKG → CKG) is batch-driven.

\---

Strategy:

Event stream ingestion

Periodic normalization job

Candidate generation batch job

Evidence scoring job

DSL proposal synthesis job

Formal commit queue

This runs asynchronously.

CKG promotion must not block student interaction.

\---

7️⃣ DSL \+ Commit Pipeline Throughput

CKG mutation frequency expected:

Low relative to PKG updates

Batched promotions

Strategy:

Queue proposals

Validate in parallel (syntax \+ ontology)

Sequential commit stage

Batch small compatible ops into single mutation

Maintain:

Max N concurrent validations

Strict single commit authority

\---

8️⃣ Trace Storage Scaling

Trace data will grow fastest.

We define:

Storage tiers

1\. Hot storage:

Recent traces (active students)

2\. Warm storage:

Recent academic period

3\. Cold archive:

Historical traces (compressed)

Trace retention policy:

Full trace kept

Student-facing distillations indexed separately

We must:

Deduplicate repeated reasoning patterns

Avoid storing full graph snapshots inside traces

Store references, not copies

\---

9️⃣ Performance Risks & Mitigations

\---

Risk 1 — Closure explosion

Mitigation:

Bound closure depth for some relation types

Cache only required relations

\---

Risk 2 — Diagnostic over-triggering

Mitigation:

Threshold gating

Cooldown windows

Minimum evidence count before re-evaluation

\---

Risk 3 — Entity resolution cost

Mitigation:

Precompute embedding indexes

Use approximate nearest neighbor search

Cache resolution results

\---

Risk 4 — TLA+ model checking cost

Mitigation:

Keep TLA+ abstract

Model mutation protocol, not full graph

Run verification offline or during deployment, not per mutation

\---

Risk 5 — Multi-agent thrashing

Mitigation:

Orchestrator layer

Single active agent per student session

Serialized decision making

\---

10️⃣ Horizontal Scaling Strategy

We scale by separating:

PKG shards (per student)

CKG read replicas

Aggregation workers

Diagnostic workers

Agent orchestration layer

Trace storage cluster

All are stateless except:

CKG commit authority

PKG shards

Stateless services allow elastic scaling.

\---

11️⃣ Latency Budget Targets

Target response times:

Operation Target

PKG update validation \<100ms  
Misconception re-eval \<150ms  
Agent response \<1.5s  
CKG proposal validation async  
CKG commit seconds acceptable  
Trace generation \<50ms extra

\---

12️⃣ Observability & Metrics

Monitor:

PKG update latency

Diagnostic evaluation latency

LLM invocation frequency

Aggregation backlog

DSL rejection rate

TLA+ check duration

Trace storage growth rate

Scaling decisions are data-driven.

\---

13️⃣ Architectural Summary

To scale safely:

PKG is sharded and light

CKG is centralized and guarded

Derived layers are incremental

Aggregation is batch-based

Agent calls are bounded and structured

Formal verification is abstract and scoped

Trace storage is tiered

The system scales horizontally for student volume and vertically only at
canonical commit authority.

\---

14️⃣ Consequences

Positive

Student interactions remain fast

Canonical integrity remains strong

Aggregation is scalable

Trace system remains sustainable

Formal methods remain affordable

Tradeoffs

More operational complexity

Need for orchestration layer

Requires disciplined feature caching

\---

15️⃣ Summary

The system scales by isolating PKG per student, centralizing canonical mutation
authority, incrementally maintaining derived layers, batching aggregation,
constraining agent calls, and abstracting formal verification scope.

Performance is engineered without compromising structural safety.

\---

ADR-011

Human-in-the-Loop (HITL) Curation and Governance Workflow

Status

Accepted

\---

1️⃣ Context

We now have:

PKG (student graph, flexible, validated)

CKG (canonical graph, DSL \+ typestate \+ TLA+ guarded)

Aggregation pipeline (PKG → candidate → DSL → formal validation)

Misconception ontology \+ diagnostic engine

Explainability \+ counterfactual trace system

Failure containment \+ rollback policy

Scalable architecture

What is still missing is the human governance layer.

Because:

Crowdsourcing can drift.

Formal invariants do not guarantee epistemic correctness.

Ontologies evolve.

Misconception libraries need refinement.

DSL promotion thresholds require calibration.

External KGs may contradict domain pedagogy.

Aggregation bias must be controlled.

Therefore, we formalize a Human-in-the-Loop (HITL) workflow that integrates
safely with:

CKG guardrails

Aggregation pipeline

Diagnostic engine

Trace framework

Versioning system

\---

2️⃣ Design Goals

The HITL layer must:

1\. Preserve canonical integrity.

2\. Prevent silent majority bias.

3\. Support expert correction without bypassing formal constraints.

4\. Allow structured review of high-impact changes.

5\. Maintain auditability.

6\. Be minimally intrusive for low-risk updates.

7\. Provide research-grade traceability.

8\. Avoid reintroducing arbitrary authority.

\---

3️⃣ Human Roles

We define three roles:

\---

3.1 Domain Curator

Responsibilities:

Review high-impact structural CKG proposals

Validate ontology-level changes

Approve or reject Band B candidates

Define or refine invariants

Curate misconception definitions

Approve Merge/Split operations

Cannot:

Directly mutate CKG outside DSL pipeline

Bypass invariant verification

\---

3.2 Pedagogical Reviewer

Responsibilities:

Review intervention effectiveness

Adjust misconception patterns

Refine remediation strategies

Analyze trace patterns

Approve diagnostic threshold changes

Cannot:

Alter canonical structure

Modify ontology schema directly

\---

3.3 Governance Admin

Responsibilities:

Manage DSL schema evolution

Update TLA+ model scope

Manage invariant library

Authorize rollback in critical failure

Manage external KG integration policy

This role is rare and system-level.

\---

4️⃣ HITL Workflow Integration Points

Human review occurs at specific control points only.

\---

4.1 Aggregation Band B Queue

When candidate is classified as:

Medium confidence

Conflicting signals

Ontology risk present

Misconception correlation high

High centrality impact

It enters Review Queue.

Curator sees:

Structured evidence summary

Edge support/opposition

External alignment score

Misconception risk score

Proposed DSL operations

Counterfactual trace

Curator decision options:

Approve → DSL enters typestate pipeline

Reject → archived with reason

Request targeted evidence tasks

Defer (time-bound)

\---

4.2 Structural Impact Threshold

Even Band A candidates auto-promoted must require review if:

Edge affects top X% central nodes

Alters prerequisite DAG at high depth

Merges nodes

Splits nodes

Changes ontology typing

Introduces new concept class

This prevents structural shock.

\---

4.3 Misconception Library Updates

New misconception definitions (from aggregation or research) require:

Pattern validation

No contradiction with existing ontology

Intervention linkage

Version tagging

Pedagogical reviewer approves.

\---

4.4 Invariant Set Evolution

If new invariant is proposed:

TLA+ model must be updated

Invariant validated against historical mutation log

Governance admin approval required

No invariant change without full model check.

\---

5️⃣ Structured Review Interface

Curators must see:

1\. Evidence summary

2\. Aggregation statistics

3\. Misconception correlation

4\. Expected structural impact

5\. Counterfactual scenario:

What if rejected?

What if accepted?

6\. Derived layer change preview

7\. Invariant sensitivity analysis

8\. Prior curator decisions on related edges

Review decisions generate:

Decision trace

Versioned record

Justification text

\---

6️⃣ Human Override Rules

Humans may:

Approve candidate

Reject candidate

Adjust thresholds (via governance)

Introduce manual DSL mutation

BUT:

Manual DSL mutation must still pass:

Validation

Proof stage

Invariant check

Typestate protocol

Humans cannot bypass formal guardrails.

\---

7️⃣ Conflict Escalation Protocol

If:

Curators disagree

External KG conflicts with strong student consensus

Formal invariants block domain change

Escalation steps:

1\. Freeze candidate

2\. Generate structured conflict report

3\. Open structured debate record

4\. Possibly run experimental task batch to gather evidence

5\. Final vote recorded

All conflict resolutions are logged permanently.

\---

8️⃣ Auditing & Transparency

Every human action must generate:

Governance trace frame

Actor identity

Evidence snapshot

Version binding

Reason code

Counterfactual explanation

Auditable at:

student level (distilled)

researcher level (full)

system governance level (complete)

\---

9️⃣ Bias & Drift Control

We introduce periodic audits:

Edge promotion bias analysis

Demographic performance drift analysis

Misconception prevalence anomalies

Intervention outcome bias

Audits can trigger:

Threshold recalibration

Pattern refinement

Review of external KG alignment

\---

10️⃣ Research & Experimentation Mode

Curators may mark:

Experimental edges

Experimental misconception patterns

Experimental interventions

These:

Do not become canonical until validated

Are flagged in CKG as provisional

Have impact sandboxed

Allows innovation without destabilization.

\---

11️⃣ Governance Versioning

We maintain:

invariant_version

ontology_version

dsl_version

misconception_library_version

threshold_policy_version

Every mutation references:

all relevant version numbers

This ensures reproducibility of past decisions.

\---

12️⃣ Degraded Mode Interaction (ADR-009)

In degraded mode:

Aggregation auto-promotion disabled

Review queue paused

Only manual DSL proposals allowed

Diagnostic engine may be restricted

HITL becomes primary safeguard.

\---

13️⃣ Consequences

Positive

Prevents naive crowdsourced truth

Preserves formal guardrails

Enables domain expert oversight

Improves long-term knowledge quality

Keeps system epistemically honest

Allows research-grade auditability

Tradeoffs

Requires curator tooling

Adds governance overhead

Slows high-impact structural evolution

\---

14️⃣ Summary

Human-in-the-Loop is not an override of formal safety, but an epistemic
refinement layer integrated with DSL, invariant verification, and trace
auditing. Curators can approve or reject candidates, refine patterns, and evolve
invariants, but cannot bypass structural guardrails.

\---

ADR-012

Research & Evaluation Framework (Scientific Validation of the Platform)

Status

Accepted

\---

1️⃣ Context

The system we designed is:

Dual-graph (PKG \+ CKG)

Formally guarded canonical core (DSL \+ typestate \+ TLA+)

Stratified reasoning

Misconception ontology with executable patterns

Aggregation-based canonical evolution

Counterfactual trace system

Human-in-the-loop governance

Scalable architecture

This is not just software.

It is a scientific hypothesis about learning:

\> That structural graph modeling \+ misconception detection \+ counterfactual
explainability \+ controlled canonical evolution improves learning outcomes and
metacognitive ability.

Therefore, we must define:

What “works” means

What metrics matter

What experiments validate the system

How to isolate causal effects

How to evaluate each architectural layer independently

This ADR defines a research-grade evaluation framework.

\---

2️⃣ Design Goals

The evaluation framework must:

1\. Measure learning improvement

2\. Measure metacognitive growth

3\. Evaluate misconception detection accuracy

4\. Evaluate intervention effectiveness

5\. Validate aggregation safety

6\. Detect unintended bias

7\. Support publishable research

8\. Remain reproducible via version binding

\---

3️⃣ Evaluation Axes

We divide evaluation into six independent axes.

\---

Axis 1 — Learning Outcome Evaluation

Research Question

Does the system improve conceptual mastery compared to baseline tools?

Metrics

Concept-level mastery gain

Time-to-mastery

Retention after delay (spaced repetition evaluation)

Transfer to novel problems

Structural alignment with CKG (graph similarity growth)

Reduction in structural divergence over time

Experimental Design

A/B groups:

Control: traditional practice \+ feedback

Variant A: system without misconception modeling

Variant B: full system

Measure over:

fixed curriculum segment

matched student cohorts

\---

Axis 2 — Misconception Detection Accuracy

Research Question

How accurate is the diagnostic engine?

Metrics

Precision (true misconception detected)

Recall (actual misconception detected)

False positive rate

Time-to-correction

Stability of belief updates

Validation Method

Expert-annotated misconception labels

Synthetic misconception injection

Controlled student experiments

Agreement between diagnostic engine and human tutors

\---

Axis 3 — Intervention Effectiveness

Research Question

Which interventions resolve misconceptions most effectively?

Metrics

Belief probability drop after intervention

Success rate on targeted follow-up tasks

Long-term misconception recurrence

Counterfactual success alignment

Experimental Design

Randomized intervention selection among:

Explanation

Contrast

Socratic probing

Graph-edit tasks

Representation switch

Evaluate effect size per misconception type.

\---

Axis 4 — Metacognitive Growth

Research Question

Does interacting with PKG and counterfactual traces improve metacognitive
awareness?

Metrics

Student ability to explain their reasoning

Structural edits initiated voluntarily

Reduction in impulsive graph changes

Prediction accuracy of own performance

Reflection depth scoring (rubric-based)

Instruments

Structured reflection prompts

Pre/post metacognitive assessment

Trace analysis of student edits

\---

Axis 5 — Canonical Integrity & Drift

Research Question

Does crowdsourced aggregation preserve semantic integrity?

Metrics

Rate of rejected DSL proposals

Frequency of invariant violation attempts

Divergence between CKG and external authoritative sources

Structural stability over time

Node/edge churn rate

Analysis

Longitudinal canonical evolution graph

Centrality drift analysis

Invariant stress test simulations

\---

Axis 6 — Explainability & Trust

Research Question

Do structured traces increase trust and comprehension?

Metrics

Student trust surveys

Curator confidence ratings

Trace clarity scores

Counterfactual usefulness ratings

Time-to-understanding correction

\---

4️⃣ Controlled Experimental Designs

We define multiple experiment types.

\---

4.1 Feature Ablation Studies

Turn off:

Misconception detection

Counterfactual traces

Graph-edit prompts

Aggregation feedback

Measure differential impact.

\---

4.2 Canonical Drift Simulation

Inject:

Artificial biased PKGs

Synthetic majority misconception

Measure:

Whether DSL \+ invariant \+ HITL stops drift

\---

4.3 Diagnostic Stress Tests

Generate:

Known misconception patterns

Adversarial but plausible graph edits

Measure detection robustness.

\---

4.4 Longitudinal Study

Track:

PKG structural complexity growth

Metacognitive trace richness

Misconception resolution latency

Canonical alignment trajectory

Over months.

\---

5️⃣ Version-Bound Reproducibility

Every experiment must log:

pkg_version

ckg_version

invariant_version

ontology_version

dsl_version

pattern_library_version

threshold_policy_version

This allows:

Replicability

Controlled rollback experiments

Publication-grade reproducibility

\---

6️⃣ Quantitative Metrics (Formal)

Define measurable variables:

Graph Alignment Score

Similarity(PKG, CKG)

Edge overlap

Structural edit distance

Path alignment score

\---

Misconception Resolution Half-Life

Time until belief \< threshold.

\---

Intervention Effect Size

Δ success probability after intervention.

\---

Canonical Stability Index

1 − (|ΔEdges| / |Edges| per time window)

\---

Drift Risk Score

Edge promotions correlated with misconception prevalence.

\---

Trace Coherence Score

Consistency between reasoning layers.

\---

7️⃣ Bias & Fairness Evaluation

We must measure:

Demographic performance disparities

Intervention effectiveness variation

Misdiagnosis skew

Aggregation dominance by specific groups

Mitigation:

Weighted aggregation

Demographic parity auditing

Transparent curator review

\---

8️⃣ Qualitative Evaluation

Student interviews

Curator interviews

Think-aloud protocols

Reflection quality coding

Usability testing

\---

9️⃣ Publication Pathways

This architecture supports publication in:

AI in Education (AIED)

Learning Sciences

Knowledge Graph Engineering

Formal Methods in Systems Design

Human-AI Interaction

Metacognition research

Each ADR maps to a publishable research module.

\---

10️⃣ Consequences

Positive

System is scientifically falsifiable

Architecture supports controlled experimentation

Strong research differentiation

Enables PhD-level work

Enables grant justification

Tradeoffs

Requires instrumentation discipline

Requires experimental rigor

Requires ethics review for human studies

\---

11️⃣ Summary

The platform is evaluated across six axes: learning outcomes, misconception
detection, intervention effectiveness, metacognitive growth, canonical
integrity, and explainability. All experiments are version-bound and
reproducible. The system is treated as a scientific instrument, not just
software.

\---

ADR-013

Data Governance, Privacy, and Ethical Model

Status

Accepted

\---

1️⃣ Context

We now have:

PKG (per-student mental model graph)

CKG (formally guarded canonical backbone)

Misconception ontology \+ belief tracking

Aggregation pipeline (crowdsourced evolution)

Trace \+ counterfactual framework

Human-in-the-loop governance

Research-grade evaluation framework

This system collects and infers:

Structural representations of student understanding

Misconception probabilities

Behavioral telemetry

Reflection traces

Graph edits over time

Intervention effectiveness

Metacognitive signals

This is highly sensitive educational cognitive data.

Therefore we must formalize:

Data ownership

Access control

Consent model

Anonymization strategy

Aggregation ethics

Research usage boundaries

Algorithmic fairness

Right to explanation and correction

Right to deletion

Model governance boundaries

This ADR defines the ethical and governance backbone.

\---

2️⃣ Core Ethical Principles

The system shall adhere to:

1\. Student Ownership of PKG

2\. Minimal Data Principle

3\. Purpose Limitation

4\. Explainability by Default

5\. Reversible Participation

6\. Non-Penalizing Diagnosis

7\. Aggregation Without Harm

8\. Fairness Monitoring

9\. Structural Safety Over Performance

10\. No Cognitive Exploitation

\---

3️⃣ Data Ownership Model

3.1 PKG Ownership

Each student owns their PKG.

PKG data is:

portable

exportable

deletable

PKG belief states (misconceptions) are personal cognitive diagnostics.

PKG cannot be used for external ranking or profiling without explicit consent.

\---

3.2 CKG Ownership

CKG is community-curated canonical knowledge.

Does not store personally identifiable student structures.

Aggregation uses anonymized, aggregated signals only.

No individual student is traceable from CKG.

\---

4️⃣ Data Classification

We classify data into sensitivity tiers.

\---

Tier 1 — Public Canonical Data (Low Sensitivity)

CKG nodes and edges

Ontology schema

Invariants

Misconception definitions

Intervention templates

\---

Tier 2 — Aggregated Statistical Signals (Medium Sensitivity)

Prevalence of misconceptions

Edge support counts

Intervention success rates

Structural divergence metrics (aggregated)

Must be:

anonymized

thresholded (no small-group exposure)

\---

Tier 3 — Individual PKG Data (High Sensitivity)

Student graph structure

Misconception belief states

AttemptEvents

Reflection traces

Counterfactual reasoning records

Protected via:

encryption at rest

strict access controls

audit logging

deletion capability

\---

5️⃣ Consent Model

Students must consent to:

1\. Use of PKG for personal learning.

2\. Aggregation of anonymized signals into CKG.

3\. Use of anonymized traces for research (optional opt-in).

4\. Participation in experimental studies (separate opt-in).

Consent must be:

granular

revocable

versioned

logged

Revocation must:

stop future aggregation

optionally remove prior contributions from future training batches
(policy-defined)

\---

6️⃣ Anonymization & Aggregation Safeguards

Aggregation must satisfy:

k-anonymity thresholds (minimum student count before promotion consideration)

differential exposure controls (avoid minority concept leakage)

no storage of raw PKG edges in CKG

no trace linking between PKG and CKG identities

Aggregation uses:

counts

normalized frequencies

weighted support

Never:

raw student identifiers

raw PKG subgraphs

\---

7️⃣ Ethical Use of Misconception Data

Misconception states must:

never be used for grading penalty

never be used for ranking students

never be exposed publicly

never be used for non-educational profiling

Misconception detection is:

diagnostic

formative

corrective

Not evaluative.

\---

8️⃣ Explainability Rights

Students have:

Right to know why a misconception was diagnosed.

Right to see supporting evidence.

Right to see counterfactual explanation.

Right to challenge diagnostic outcome.

Right to request belief reset.

Curators have:

Full trace visibility.

No ability to see unrelated student data.

\---

9️⃣ Fairness & Bias Monitoring

The system must monitor:

Diagnostic false positive rates across demographics.

Intervention effectiveness disparities.

Canonical promotion bias.

Entity resolution bias (language, cultural phrasing).

Overrepresentation of dominant group structures.

Mitigation strategies include:

Weighted aggregation

Stratified evaluation

Curator review of flagged drift

Periodic fairness audit reports

\---

10️⃣ Algorithmic Boundaries

Agents are not allowed to:

Infer psychological traits beyond learning scope.

Predict personality.

Infer socio-economic background.

Use data for targeted persuasion.

Infer mental health states.

System scope is educational cognition only.

\---

11️⃣ Data Retention Policy

We define retention windows:

PKG structural data: retained while student active.

AttemptEvents: configurable retention period.

Traces: tiered storage (hot/warm/cold).

Aggregation statistics: persistent (no raw identity).

Students may request:

Full export

Full deletion

Partial deletion (specific attempts or misconception states)

Deletion must cascade to:

PKG

Trace references

Event logs (except aggregated anonymized stats)

\---

12️⃣ Research Ethics Compliance

For experiments:

IRB / Ethics review required (where applicable).

Clear disclosure of experimental features.

No hidden manipulation of learning paths without consent.

Debriefing mechanism available.

All research must:

Be version-bound

Log intervention variants

Avoid harm

\---

13️⃣ Governance Transparency

We publish:

DSL schema

Invariant definitions

Misconception taxonomy

Aggregation policy

Promotion thresholds (high-level)

Fairness audit summaries

Opaque algorithmic behavior is not allowed.

\---

14️⃣ Risk Scenarios & Mitigation

\---

Risk 1 — Misconception Label Stigma

Mitigation:

Use neutral phrasing.

Emphasize dynamic belief update.

No permanent labels.

\---

Risk 2 — Canonical Drift Due to Majority Bias

Mitigation:

Guardrails \+ review (ADR-005/011)

Misconception gating

\---

Risk 3 — Overdiagnosis

Mitigation:

Threshold gating

Confidence decay over time

Human review triggers

\---

Risk 4 — Data Breach

Mitigation:

Encryption

Segmented storage

Minimal data retention

Zero trust access

\---

15️⃣ Governance Versioning

All governance rules are versioned:

privacy_policy_version

consent_model_version

fairness_policy_version

aggregation_policy_version

Every trace and experiment binds to governance version.

\---

16️⃣ Consequences

Positive

Ethical clarity

Research credibility

Regulatory readiness

Student trust

Scalable governance

Tradeoffs

Increased operational overhead

Need for compliance tooling

More complexity in aggregation logic

\---

17️⃣ Summary

The platform treats PKG data as student-owned cognitive data, protects it
through strict governance, aggregates only anonymized signals into CKG, enforces
fairness monitoring, and provides strong explainability rights. Formal
guardrails protect structure; ethical guardrails protect learners.

\---

ADR-014

Mathematical Integration Blueprint

(Category Theory \+ UNITY \+ Type Theory \+ Graph Semantics)

Status

Accepted

\---

1️⃣ Context

Your system combines:

Typed property graphs (PKG \+ CKG)

Ontology reasoning

DSL mutation algebra

Typestate protocol

TLA+ verification

CRDT islands

Misconception belief dynamics

Multi-agent orchestration

Stratified reasoning layers

Trace and counterfactual logic

These components are currently architecturally coherent.

ADR-014 provides the formal mathematical backbone that unifies them into a
single theoretical framework.

We will show how the system can be interpreted in terms of:

Category Theory (compositionality)

Type Theory (safety and constraints)

Algebra (mutation as algebraic structure)

Order Theory (monotonicity, semilattices)

UNITY (invariant-driven distributed reasoning)

Temporal Logic (state evolution)

Functorial semantics (intent → effect mapping)

This is not for runtime code.  
This is for structural coherence and theoretical clarity.

\---

2️⃣ Graphs as Categories

We interpret:

Nodes \= Objects

Edges \= Morphisms

Paths \= Composition

Identity morphisms \= trivial edges

So each graph (PKG or CKG) is a small category:

\\mathcal{G} \= (Ob, Hom, \\circ, id)

Where:

concepts

relations

Composition \= path concatenation

Identity \= self-loop

This immediately gives:

Associativity of path composition

Structural reasoning over morphisms

Formal path-based inference

\---

3️⃣ CKG as a Constrained Category

CKG is not an arbitrary category.

It is a category with constraints:

Acyclicity in specific subcategories (e.g. prerequisite DAG)

Disjoint object types (ontology disjointness)

Typed morphisms (domain/range restrictions)

Thus:

\\mathcal{C}\_{CKG} \\subseteq \\mathbf{Cat}

It is a category enriched with:

Ontological typing

Invariant predicates

In category-theoretic terms:

CKG is a category with additional structure:

A fibration over the ontology type lattice.

\---

4️⃣ PKG as a Freely Generated Category

PKG is:

Less constrained

Generated by student operations

Formally:

PKG is a free category generated from student-added edges, subject only to
validation constraints.

It can temporarily violate global canonical properties (but not schema
constraints).

Thus:

\\mathcal{C}\_{PKG} \= Free(Graph_s) / SchemaConstraints

This captures epistemic freedom.

\---

5️⃣ Ontology as a Type System

Ontology layer can be interpreted as:

A type theory

Or a fibered category over concept space

Nodes carry types:

Type : Ob \\to \\mathcal{T}

Relations carry typing rules:

r : A \\to B \\quad \\text{only if} \\quad A \\in Domain(r), B \\in Range(r)

This mirrors:

Dependent typing

Refinement types

Domain/range constraints as type guards

Ontology disjointness:

A \\cap B \= \\varnothing

Is a logical constraint over object typing.

\---

6️⃣ DSL Mutation as Algebra

The CKG DSL defines a mutation algebra:

Let be the set of DSL operations.

Define:

(M, \\circ)

Composition of operations is associative if:

Base versions match

Invariants preserved

Thus DSL operations form a partial monoid:

Identity \= no-op

Composition defined only if guards satisfied

This algebraic structure is crucial for:

Batch operations

Formal reasoning

TLA+ modeling

\---

7️⃣ Typestate Protocol as Category of States

The mutation pipeline:

Proposed → Validated → Proven → Committed

Is a state machine.

Formally:

Objects \= states

Morphisms \= legal transitions

This is a small category .

Illegal transitions simply do not exist as morphisms.

This makes:

Skipping states impossible by construction

State transitions compositional

\---

8️⃣ UNITY Interpretation

UNITY reasoning treats programs as:

Sets of states

Invariants that must hold

Progress properties

In your architecture:

State space \= CKG Layer 0

Invariants \= structural \+ ontology constraints

Actions \= DSL operations

UNITY expresses:

I \\land Action \\Rightarrow I'

Meaning:

If invariant holds before, it holds after action.

This matches your CKG mutation requirement exactly.

UNITY gives conceptual invariant structure. TLA+ checks it mechanically.

\---

9️⃣ CRDT Islands as Join-Semilattices

Aggregation counters live in:

(S, \\vee)

Where:

\= support counts

\= merge (join)

This is a join-semilattice.

Properties:

Commutative

Associative

Idempotent

Thus CRDT counters converge without central coordination.

Crucially:

They are not allowed to affect CKG structure directly.

They live in a monotonic lattice separate from canonical core.

\---

🔟 Misconception Belief as Probabilistic Functor

Each student has belief function:

B_s : \\mathcal{C}\_{PKG} \\to \[0,1\]

Mapping:

Concept / misconception objects

To belief values

This is a functor from graph structure to probability space.

Interventions update:

B_s' \= Update(B_s, Evidence)

This update is not required to be monotonic — epistemic states can decrease.

\---

11️⃣ Agents as Functors (Intent → Effect)

An agent action can be modeled as:

F : Context \\to Action

Where:

Context includes:

Processed graph summaries

Belief states

Version bindings

Action may be:

PKG mutation

Intervention

CKG DSL proposal

This is a functorial mapping from state space to action space.

The Agent Contract (ADR-007) restricts which codomain actions are permitted.

\---

12️⃣ Stratification as Layered Category

Stratified reasoning (ADR-002) corresponds to:

A layered construction:

Layer_0 \\subset Layer_1 \\subset Layer_2 \\subset Layer_3 \\subset Layer_4

But with:

No upward dependence allowed.

This resembles:

Stratified logic programming

Non-circular categorical construction

Well-founded recursion

Derived layers are functorial transformations of lower layers.

\---

13️⃣ Counterfactuals as Minimal Morphism Removal

A counterfactual:

“What minimal change flips outcome?”

Can be formalized as:

Find minimal Δ in:

\\Delta \\subseteq Ob \\cup Hom

Such that:

Decision(\\mathcal{C} \\setminus \\Delta) \\neq Decision(\\mathcal{C})

This is a minimal perturbation problem over category structure.

\---

14️⃣ Multi-Agent System as Monoidal Category

If multiple agents act:

Their actions compose.

We can model:

(Actions, \\otimes)

As a monoidal category, where:

Tensor \= independent agent actions

Composition \= sequential actions

CKG commit serialization ensures canonical linearization.

\---

15️⃣ Soundness Boundaries

We can now state:

Structural soundness holds if:

DSL operations preserve invariants (UNITY)

TLA+ model guarantees atomicity

Ontology typing holds

Epistemic correctness is not formally guaranteed. Only structural correctness
is.

This is a deliberate boundary.

\---

16️⃣ Why This Matters

This integration blueprint ensures:

The system is not a bag of features.

Each layer has a mathematical interpretation.

Formal methods align with algebraic structure.

Category theory explains compositionality.

UNITY explains invariant discipline.

Type theory explains ontology constraints.

Semilattice theory explains CRDT islands.

Temporal logic explains state evolution.

This coherence makes the architecture:

Research defensible

Mathematically elegant

Extendable without collapse

Resistant to conceptual drift

\---

17️⃣ Summary

Your platform can be interpreted as:

A stratified category of knowledge graphs,

With typed morphisms enforced by ontology,

Mutated through a partial monoid DSL,

Guarded by UNITY invariants,

Verified by TLA+ temporal logic,

Aggregated via semilattice CRDT islands,

Diagnosed via probabilistic functors,

Orchestrated by agents constrained by morphism contracts.

This is a mathematically coherent architecture.

\---

ADR-016

Formal Model of Misconception Belief Dynamics

Status

Accepted

\---

1️⃣ Objective

We formalize:

How belief in misconceptions evolves

How evidence updates occur

When intervention is triggered

When belief converges

Under what conditions misdiagnosis stabilizes or oscillates

\---

2️⃣ Belief Space

For student :

Let:

\\mathcal{M} \= \\{m_1, m_2, ..., m_k\\}

be misconception objects.

Define belief function:

B_s : \\mathcal{M} \\to \[0,1\]

This defines a vector in:

\\mathbf{B}\_s \\in \[0,1\]^k

Interpretation:

\= probability student holds misconception

\---

3️⃣ Evidence Model

Let:

E \= \\{e_1, e_2, ..., e_n\\}

Evidence arises from:

AttemptEvents

Graph edits

Reflection traces

Response explanations

Define likelihood:

P(e_j \\mid m_i)

\---

4️⃣ Bayesian Update Rule

After observing evidence :

B_s'(m_i) \=  
\\frac{P(e \\mid m_i) B_s(m_i)}  
{\\sum_j P(e \\mid m_j) B_s(m_j)}

This gives normalized update.

\---

5️⃣ Temporal Belief Decay

To avoid permanent labeling:

Introduce decay parameter :

B_s^{t+1}(m) \= \\lambda B_s^t(m)

Unless reinforced.

This models:

Forgetting

Correction

Cognitive fluidity

\---

6️⃣ Intervention Trigger Function

Define threshold:

\\tau_m

Intervention triggered if:

B_s(m) \> \\tau_m

But with cooldown constraint:

t \- t\_{last}(m) \> \\Delta

Prevents over-intervention.

\---

7️⃣ Convergence Analysis

We consider:

Repeated correct evidence reduces belief:

If likelihood satisfies:

P(e\_{correct} \\mid m_i) \< P(e\_{correct} \\mid \\neg m_i)

Then belief monotonically decreases.

Under bounded noise, belief converges to:

\\lim\_{t \\to \\infty} B_s(m_i) \= 0

if misconception corrected.

\---

8️⃣ Oscillation Risk

Oscillation occurs if:

Evidence alternates ambiguous

Likelihoods symmetric

Mitigation:

Use confidence-weighted updates

Introduce smoothing prior

Apply monotonicity floor

\---

9️⃣ Belief Space Geometry

Belief space is simplex:

\\Delta^k

Trajectory is path in simplex.

We can measure:

Entropy reduction

KL divergence from prior

Stability index

\---

🔟 Summary

Misconception dynamics are modeled as:

Bayesian update process

With decay

With threshold-triggered intervention

Convergent under consistent corrective evidence

This provides formal epistemic grounding.

\---

ADR-017

Categorical Semantics of Learning Trajectories

Status

Accepted

\---

1️⃣ Objective

Formalize:

What is a learning trajectory?

How PKG evolves structurally

How progression can be measured

How trajectories compare across students

\---

2️⃣ PKG as Category

Each PKG is a category:

\\mathcal{C}\_s

Learning trajectory is sequence:

\\mathcal{C}\_s^0 \\to \\mathcal{C}\_s^1 \\to \\mathcal{C}\_s^2 \\to ...

Each step induced by graph mutation.

\---

3️⃣ Trajectory as Functor Chain

Each update is a functor:

F_t : \\mathcal{C}\_s^t \\to \\mathcal{C}\_s^{t+1}

Composition:

F\_{t+1} \\circ F_t

Represents cumulative learning.

\---

4️⃣ Alignment Functor to CKG

Define alignment mapping:

A_s : \\mathcal{C}\_s \\to \\mathcal{C}\_{CKG}

Measures structural similarity.

Learning progression increases functorial consistency.

\---

5️⃣ Structural Distance Metric

Define:

d(\\mathcal{C}\_s, \\mathcal{C}\_{CKG})

Using:

Edge mismatch

Path inconsistency

Type violations

Goal:

d \\to 0

as learning progresses.

\---

6️⃣ Homotopy Perspective

Two PKGs are equivalent if:

They can be transformed via sequence of valid morphism adjustments without
violating ontology.

Defines equivalence class of conceptual understanding.

\---

7️⃣ Meta-Learning as Higher-Order Morphism

Metacognitive growth is:

Ability to define morphisms over own morphisms.

Formally:

Student learns transformation rules over own graph edits.

Category of categories.

\---

8️⃣ Trajectory Stability

We define stability if:

For sufficiently large :

\\mathcal{C}\_s^{t+1} \\approx \\mathcal{C}\_s^t

except refinement additions.

Indicates mastery plateau.

\---

9️⃣ Summary

Learning trajectory is:

Functorial evolution of student category

Alignment process toward canonical category

With metacognitive second-order structure

\---

ADR-018

Formal Sketch of Canonical Stability Under Aggregation

Status

Accepted

\---

1️⃣ Objective

Prove that:

Aggregation of PKGs cannot destabilize CKG under guardrails.

\---

2️⃣ Aggregation Input

Each PKG produces candidate edge set:

E_s

Aggregation combines via support counts:

Support(e) \= \\sum_s 1\_{e \\in PKG_s}

\---

3️⃣ CRDT Semilattice Structure

Support counts live in:

(\\mathbb{N}, \\max)

Monotonic.

Thus:

Aggregation is monotonic.

\---

4️⃣ Promotion Condition

Edge promoted only if:

Support(e) \> \\theta

AND

Ontology valid

Invariants preserved

DSL validated

Proven via TLA+

\---

5️⃣ Stability Argument

Even if majority PKGs incorrect:

DSL guardrails enforce:

Acyclicity

Typing

No invariant violation

Thus no structural corruption possible.

Worst case:

Correct edge not promoted

But incorrect edge rejected

\---

6️⃣ Drift Bound

Let:

\\mathcal{C}\_{CKG}^{t}

be canonical at time t.

Mutation allowed only if:

Invariant(\\mathcal{C}\_{CKG}^{t+1}) \= True

Thus:

CKG always remains in invariant-satisfying subspace.

Therefore:

\\forall t, \\mathcal{C}\_{CKG}^{t} \\in SafeRegion

\---

7️⃣ Long-Term Convergence

If:

Student signals unbiased

Aggregation threshold calibrated

Human review active

Then canonical converges toward:

\\mathcal{C}\_{True}

Approximation of domain knowledge.

Not guaranteed perfect epistemically. Guaranteed structurally safe.

\---

8️⃣ Failure Bound

Worst-case under adversarial students:

High rejection rate

Slowed evolution

No corruption

System fails safe.

\---

9️⃣ Summary

Under:

Semilattice aggregation

DSL gate

Ontology constraints

UNITY invariants

TLA+ verification

Canonical graph remains structurally stable under arbitrary student noise.

\---

Final State of Your Architecture

You now have:

Bayesian epistemic model

Categorical learning semantics

Semilattice aggregation theory

Formal structural invariants

Multi-agent contract system

Typed ontology backbone

CRDT monotonic islands

UNITY invariant discipline

Temporal logic commit safety

Research validation model

Ethical governance model

This is doctoral-level system architecture.
