# NOEMA REALIGNMENT

## Authoritative Specification — Read Before Refactoring

---

## 0\. PURPOSE

This document is the **single source of truth** for Noema's pedagogical core.
Implementation has drifted from original design intent — the system grew rich in
infrastructure (microservices, card types, epistemic modes, dual graphs,
strategy systems) but the central learning loop became diffuse. This document
re-anchors the system to its founding principle:

**Noema is a goal-driven, agentic, closed-loop learning system that prioritizes
how a learner thinks, not whether they answer correctly.**

Every decision in this document subordinates correctness to reasoning,
presentation to pedagogy, and feature richness to loop integrity. Where this
document and any other Noema document conflict, **this document wins**.

**Rule for implementation:** No section here describes a new product. Every
change is either a clarification of existing intent, an additive entity, or a
redirection of what an existing entity serves. Nothing in the preservation list
(§11) may be deleted.

---

## 1\. CORE PRINCIPLES

These six principles govern every implementation decision. They are
non-negotiable.

### P1. Reasoning over correctness

A correct answer with flawed reasoning is treated as **incomplete learning**. A
wrong answer with sound reasoning is treated as **partial success**. The
system's primary signal is reasoning quality; correctness is secondary evidence.

### P2. Alignment-driven pedagogy

Every learning interaction must explicitly align three things:

- **Objective** — what should be learned
- **Activity** — how it is practiced
- **Assessment** — how learning is verified

Misalignment is a validation failure, not a stylistic choice.

### P3. No concept is ever finished

Concepts exist in one of two states: `stable` or `unstable`. There is no
"completed," "mastered," or "done" state. Stability is always revocable based on
new evidence.

### P4. Repetition with transformation

Repetition is required, but never identical. Each revisit of a concept must
present it through a different cognitive transformation (see §7). Identical
re-presentation is forbidden.

### P5. Structured but adaptive

Learning follows a planned structure (LessonPlan), but the system adapts
dynamically when triggers fire (see §8). Adaptation always uses the **minimum
sufficient change**.

### P6. Agents propose, rules constrain

Agents generate plans, evaluations, and content. Deterministic rules
(validation, invariants, the Pedagogy Guardian) enforce correctness, alignment,
and safety. No agent output reaches the learner without passing validation.

---

## 2\. THE ATOMIC UNIT IS THE STEP

This is the most fundamental clarification in this document.

**The Step is the atomic unit of learning in Noema.** Cards are content payloads
referenced by Steps. The scheduler, the evaluator, mastery tracking, and
gamification all operate at Step granularity.

### 2.1 Why this matters

A Card is _content_ — a question, a prompt, a piece of material. A Step is
_content with cognitive intent_ — content delivered for a specific objective, in
a specific epistemic mode, serving a specific goal. Without Steps, the system
has no place to record _why_ a piece of content was shown to a learner.
Cognitive intent is not metadata — it is the unit itself.

### 2.2 Step entity

Step {

id: string

lesson_plan_id: string

objective: string // what this step exists to teach

serves_goals: string\[\] // goal IDs from the lesson plan

eligible_modes: EpistemicMode\[\] // see §4 — agent picks one

selected_mode: EpistemicMode // chosen at execution time

transformation_type: TransformationType // see §7

activities: Activity\[\]

expected_outcome: string

evaluation_type: string // how this step will be assessed

difficulty: number // 0..1

is_repair: boolean // true if generated from a trigger

concept_refs: string\[\] // concepts this step targets

}

Activity {

id: string

step_id: string

content_source: // ONE of:

    | { type: 'card', card\_id: string }                // existing Noema card

    | { type: 'generated', template\_id: string, prompt: string }  // agent-generated

prompt: string // may override card default

expected_response_type: string

variant_seed: string // ensures non-identical repetition

}

### 2.3 What happens to Cards

Cards remain in the Content Service exactly as they are. All 22+ card types
persist. The change is in _how cards are invoked_: a Card is no longer presented
directly — it is referenced by an Activity inside a Step. Cards become
**templates and content payloads** that Steps draw from.

A new field is added to each Card:

- `compatible_transformations: TransformationType[]` — which transformation
  types this card can serve

This lets the Content Generation Agent select cards as templates for Step
generation.

### 2.4 What happens to scheduling, evaluation, mastery

- **Scheduler** now schedules Steps (or more precisely: schedules concepts, and
  instantiates a Step at presentation time)
- **Evaluation** produces a per-Step Evaluation object (see §6)
- **Mastery** is tracked at the **concept level**, derived from Step outcomes
- **FSRS** continues to compute stability — but its inputs are derived from Step
  evaluations, and its outputs are interpreted through the binary state model in
  §3

### 2.5 Migration

Existing Card-level data is not deleted. For backward compatibility:

- Each historical Card attempt is wrapped as a synthetic Step with
  `objective = 'legacy_attempt'` and `selected_mode = 'reinforcement_default'`
- New attempts going forward must be Steps

---

## 3\. MASTERY IS BINARY, REASONING-DOMINANT

### 3.1 The state model

Every concept in the Personal Knowledge Graph has a state field:

ConceptState \= 'stable' | 'unstable'

There is no third state. There is no "achieved" or "completed." A concept is
`stable` _right now_ or it is not.

### 3.2 How state is determined

A concept is `stable` if and only if **both** conditions hold:

1. **Retention condition:** FSRS stability for this concept is above threshold
   `S_RET` (configurable per profile)
2. **Reasoning condition:** Average reasoning quality across the last `N` Step
   evaluations targeting this concept is above threshold `R_REAS` (configurable
   per profile)

If either condition fails, state is `unstable`.

### 3.3 Why both signals are required

A learner who consistently answers correctly but cannot explain _why_ has
learned to recognize, not to reason. A learner who reasons well but occasionally
slips on retention is in the normal forgetting cycle and is reinforcing real
understanding. The second case is healthier than the first.

### 3.4 State transitions

- `unstable → stable`: both conditions cross their thresholds upward
- `stable → unstable`: either condition crosses its threshold downward

A single bad evaluation can flip `stable → unstable` if it pulls the reasoning
average below `R_REAS`. This is intentional. There is no smoothing — the system
trusts current evidence.

### 3.5 FSRS continues internally

FSRS is not removed. It continues to compute continuous stability for scheduling
intervals. The binary state is a **derived view** layered on top of FSRS, not a
replacement for it. Internally, scheduling math is continuous; externally, the
learner's relationship with each concept is binary.

### 3.6 Mastery badges and "achievements"

Any badge or achievement that implies permanent mastery is reframed:

- "Mastered for 90 days" → "Currently stable for 90 days" (revocable)
- "Card mastered" → "Concept stable" (per concept, revocable)

When a concept flips back to `unstable`, any derived badge is revoked. See §10
for full gamification treatment.

---

## 4\. MODE SELECTION OPERATES DIRECTLY ON THE 30 EPISTEMIC MODES

There is no abstraction layer above the existing 30 epistemic modes. Mode
selection is a deterministic mapping from learner state to **eligibility
groups** — sets of modes that are appropriate in a given situation. The agent
picks one mode from the eligible set based on context (recency, novelty, learner
preference).

### 4.1 Eligibility groups

The following groups are the routing table for mode selection. Each group
contains modes from the existing 30 that fit a specific learner condition.

GROUP_NEW_CONCEPT // when introducing material not seen before

→ Inquiry-Based Learning

→ Problem-Based Learning

→ Case-Based Learning

→ No-Definition Mode

→ Minimal Information Learning

GROUP_REINFORCEMENT // strengthening previously seen knowledge

→ Generative Retrieval

→ Confidence-Weighted Learning

→ Prediction-Based Learning

GROUP_CONFUSION // when concepts are being mixed or boundaries are unclear

→ Loophole Learning

→ Adversarial Learning

→ Contradiction Exposure

GROUP_WEAK_REASONING // when reasoning quality is low despite correctness

→ Teaching-to-Learn (Feynman)

→ Reverse Learning

→ Concept Recombination

→ Error Pattern Reflection

GROUP_TRANSFER // when concept is stable, ready for novel contexts

→ Dimensional Translation

→ Concept Recombination

→ Graph Completion Learning

→ Case-Based Learning

GROUP_META // for calibration, overconfidence, slow thinking

→ Confidence-Weighted Learning

→ Prediction-Based Learning

→ Error Pattern Reflection

→ Ambiguity Tolerance Mode

GROUP_PRESSURE // for endurance, escalation, time-bound practice

→ Escalation Mode

→ Time-Pressure Cognitive Mode

**Implementation note for Codex:** The full list of 30 epistemic modes
(categories VIII–X in the existing modes documentation) must be classified into
these groups during implementation. A mode may appear in multiple groups. Any
mode not assignable to any group must be flagged for design review — do not
silently drop it.

### 4.2 Selection logic

function selectEligibleModes(learnerState, conceptState, lastTrigger):

if lastTrigger.type \== 'confusion': return GROUP_CONFUSION

if lastTrigger.type \== 'overconfidence': return GROUP_META

if lastTrigger.type \== 'slow_thinking': return GROUP_META

if conceptState \== 'unstable' AND

     reasoning\_quality\_recent \< R\_REAS:        return GROUP\_WEAK\_REASONING

if conceptState \== 'stable' AND

     attempts\_since\_stable \> N\_TRANSFER:       return GROUP\_TRANSFER

if concept.is_new: return GROUP_NEW_CONCEPT

else: return GROUP_REINFORCEMENT

The agent then selects one mode from the eligible set. Selection prefers modes
not used recently for this concept, to maintain variation.

### 4.3 Strategy Loadouts (if implemented)

Strategy Loadouts, if they exist in the codebase, are an **optional
delivery-style modifier** applied _after_ mode selection. They control pacing,
error tolerance, and feedback style — never the mode itself. If Loadouts are not
crucial or not yet implemented, the system functions correctly without them. Do
not block this realignment on Loadout work.

---

## 5\. EVERY SESSION HAS A LESSON PLAN

### 5.1 The principle

A LessonPlan exists for **every session**, without exception. The data model is
uniform. What varies is how richly the plan is populated:

- **Review sessions** get an auto-generated minimal plan
- **Goal-driven sessions** get a fully populated plan with validated alignment

### 5.2 LessonPlan entity

LessonPlan {

id: string

session_id: string

rigor_level: 'minimal' | 'full'

topic: string

goals: Goal\[\] // up to 4; may be empty for minimal

prerequisites: ConceptRef\[\] // pulled from Knowledge Graph

steps: Step\[\] // ordered

assessment_strategy: string // how goals will be measured

adaptation_rules: string // when and how to replan

source_decks: DeckRef\[\] // existing Noema decks as content sources

source_categories: CategoryRef\[\]

}

Goal {

id: string

lesson_plan_id: string

description: string

type: 'discrimination' | 'reasoning' | 'transfer' | 'acquisition' |
'reinforcement'

parent_goal_id: string | null

state: 'pending' | 'active' | 'stable' | 'unstable'

source: 'system_proposed' | 'user_accepted' | 'user_edited'

}

### 5.3 Goal cap

A LessonPlan may have **at most 4 active goals**. This is enforced at the API
boundary in the Session Service. Attempting to create a 5th active goal returns
a validation error.

### 5.4 Validation by Pedagogy Guardian

For `rigor_level = 'full'` plans, the Pedagogy Guardian validates before
activation:

- Goals do not contradict each other
- Every Step's `serves_goals` is non-empty
- Every Step's evaluation_type can measure at least one of the goals it serves
- Prerequisites exist in the learner's Personal Knowledge Graph (or are added to
  a repair branch)

For `rigor_level = 'minimal'` plans, only structural validation runs (entity
references resolve, no orphan steps).

### 5.5 What happens to Decks and Categories

Decks and Categories are **preserved in full**. They are no longer the unit of
session composition — they are content sources the planner draws from. A
LessonPlan references decks/categories via `source_decks` and
`source_categories`. The orthogonal-context semantics of categories (cards
belonging to multiple categories with different framings) are preserved and feed
into how the planner picks content.

---

## 6\. EVALUATION COMBINES TRACE AND SELF-RATING

### 6.1 The 3-choice self-rating

The learner's self-rating UI is simplified to three options:

KNEW_IT → confidence_signal \= 1.0

HESITATED → confidence_signal \= 0.5

DIDNT_KNOW → confidence_signal \= 0.0

This replaces any 4-button or continuous self-rating. The 3-option model maps
cleanly to learner confidence and is harder to game than nuanced self-ratings.

### 6.2 The 7-frame trace produces reasoning_quality

The Mental Debugger's 7-frame trace is no longer a diagnostic overlay. It is the
**primary evaluation mechanism**. The Metacognition Service produces a
`reasoning_quality` score in `[0, 1]` from the trace, deterministically derived
from frame-level signals (specific derivation logic to be specified per frame in
the Metacognition Service spec).

### 6.3 The combination formula

The final evaluation score that feeds FSRS, state determination, and
gamification is a weighted combination of `reasoning_quality` (from trace) and
`confidence_signal` (from self-rating). The trace dominates; the self-rating
contributes less when reasoning is strong, and almost nothing when reasoning is
weak.

function combineSignals(reasoning_quality, confidence_signal):

if reasoning_quality \> 0.7: // high reasoning — trust the trace heavily

    w\_trace \= 0.60

    w\_self  \= 0.40

elif reasoning_quality \>= 0.3: // medium — balanced toward trace

    w\_trace \= 0.85

    w\_self  \= 0.15

else: // low reasoning — self-rating is unreliable

    w\_trace \= 0.95

    w\_self  \= 0.05

return w_trace \* reasoning_quality \+ w_self \* confidence_signal

**Implementation note for Codex:** Weights are starting values for empirical
tuning. Expose them as configuration. The principle that matters is the
**monotonic relationship**: as reasoning_quality decreases, the weight given to
self-rating must also decrease.

### 6.4 Why this inversion matters

A learner with poor reasoning is, by definition, miscalibrated about their own
knowledge — so their self-rating is the least trustworthy in exactly the
situations where the system might naively rely on it most. The formula encodes
this: when the learner is most confident they "knew it" but the trace shows they
didn't reason well, the system trusts the trace.

### 6.5 The Evaluation object

Evaluation {

step_id: string

correct: boolean // did they get the answer right

reasoning_quality: float // \[0,1\] from 7-frame trace

confidence_signal: float // \[0,1\] from self-rating

combined_score: float // \[0,1\] from formula above

trace: SevenFrameTrace // full trace preserved

error_type: string | null

misconception_ref: string | null // links to PKG misconception node

triggers_fired: TriggerRef\[\]

recommended_action: string

}

The `combined_score` is what feeds FSRS rating mapping (e.g., `<0.3 → Again`,
`0.3-0.5 → Hard`, `0.5-0.8 → Good`, `>0.8 → Easy`) and what feeds the
reasoning-condition check in §3.2.

### 6.6 Wrong answer with good reasoning

Per P1: a wrong answer with high `reasoning_quality` produces a `combined_score`
that may still be in the "Good" range. This is **intended behavior**. The
learner reasoned well; the slip is in retention or execution, not in
understanding. FSRS will still adjust the interval modestly downward (because
correctness contributes), but state may remain `stable` if reasoning average
remains healthy.

---

## 7\. REPETITION GENERATES VARIANTS DYNAMICALLY

### 7.1 The principle

When a concept comes due for repetition, the system does not re-present the same
Step. It generates a **new Step using a different transformation** of the same
concept. The Content Generation Agent is responsible for this generation at
runtime.

### 7.2 The six transformation types

TransformationType \=

| 'recall' // direct retrieval — "what is X?"

| 'explanation' // why does X work this way?

| 'comparison' // how does X differ from Y?

| 'application' // use X to solve a new problem

| 'perturbation' // what changes if a condition of X is altered?

| 'error_detection' // identify what's wrong with this use of X

These are **independent of epistemic modes** (§4). A transformation is _what
shape_ the repetition takes; an epistemic mode is _what cognitive activity_ the
Step uses. They compose: e.g., a `comparison` transformation delivered in
`Adversarial Learning` mode.

### 7.3 Selection rule

Each concept tracks the transformation history per learner: which
transformations have been used, and when. On repetition:

function selectTransformation(concept, learner):

used_recently \= transformations used in last K presentations

eligible \= ALL_TRANSFORMATIONS \- used_recently

if eligible is empty:

    eligible \= ALL\_TRANSFORMATIONS  // cycle has completed; all become eligible again

return least_recently_used(eligible)

This guarantees that no transformation repeats until all six have been cycled
through (or the eligible set has been exhausted).

### 7.4 Generation flow

1\. Scheduler determines concept C is due for learner L

2\. System selects transformation T for (C, L) per §7.3

3\. System selects eligible modes for current state per §4.2

4\. System selects one mode M from eligible set

5\. Content Generation Agent generates Step:

     \- Uses Cards of compatible\_transformations including T as templates

     \- Constructs prompt appropriate for transformation T and mode M

     \- Produces Activity with content\_source pointing to generated content

6\. Pedagogy Guardian validates Step

7\. Step is presented to learner

### 7.5 Cards as templates

Cards retain all their existing structure and content. The new role: cards are
**templates the agent draws from** when generating Step Activities. A Comparison
Card becomes a template for `comparison` transformations. An Error-Spotting Card
becomes a template for `error_detection`. The agent may use the card directly,
paraphrase it, or generate a fresh prompt patterned after it.

### 7.6 Cost note

Dynamic generation runs on every repetition. This has real LLM cost and latency
implications. Implementation should:

- Cache generated variants per (concept, transformation, mode) tuple with
  reasonable TTL
- Allow falling back to direct card presentation if generation fails
- Allow falling back to direct card presentation if budget thresholds are
  exceeded

---

## 8\. THE TRIGGER → INTERVENTION LOOP

### 8.1 Triggers are first-class

The Metacognition Service emits **Triggers** when learner behavior indicates a
learning issue. Triggers are not just diagnoses — they are events that the
Strategy Service subscribes to and responds to with specific interventions.

Trigger {

id: string

learner_id: string

type: TriggerType

severity: float // \[0,1\]

detected_from: TraceFrameRef\[\]

context: { concept_refs, step_id, session_id }

recommended_intervention: InterventionType

status: 'open' | 'addressed' | 'recurring'

}

TriggerType \=

| 'failure' // repeated incorrect answers on same concept

| 'confusion' // mixing up related concepts

| 'slow_thinking' // response time well above baseline

| 'overconfidence' // confident but wrong, or high self-rating \+ low reasoning

| 'boredom' // accuracy high, engagement signals dropping

| 'prerequisite_gap' // failure pattern points to missing foundation

### 8.2 Trigger → Intervention map

failure → insert repair Step (transformation \= 'explanation' or
'error_detection')

confusion → insert Step from GROUP_CONFUSION (typically Contrastive Pair)

slow_thinking → reduce difficulty; insert Step from GROUP_META

overconfidence → insert calibration Step from GROUP_META

boredom → increase difficulty OR transition to GROUP_TRANSFER

prerequisite_gap → branch to repair sequence on prerequisite concept

### 8.3 The closed loop

This is the loop Noema's agent layer must implement:

┌─→ Session Service: present next Step

│ ↓

│ Learner performs Activity

│ ↓

│ Metacognition Service: produce 7-frame trace, compute reasoning_quality

│ ↓

│ Metacognition Service: build Evaluation, emit Triggers if any

│ ↓

│ Strategy Service: receive Triggers, select intervention

│ ↓

│ Strategy Service: replan (see §9 — local / structural / full)

│ ↓

│ Pedagogy Guardian: validate replan

│ ↓

└── Session Service: update LessonPlan, generate next Step

This is the missing piece. All services to support it exist. The work is wiring
orchestration in the agents.

---

## 9\. REPLANNING USES MINIMUM SUFFICIENT CHANGE

When a Trigger fires, the Strategy Service replans. There are three levels:

### 9.1 Local adjustment

Insert one Step, swap one Step, or adjust difficulty of the next Step. No change
to overall plan structure.

### 9.2 Structural adjustment

Reorder remaining Steps, insert a repair branch (a sub-sequence of Steps
targeting a prerequisite or misconception), or change the eligible mode group
for upcoming Steps.

### 9.3 Full replanning

Rebuild the entire LessonPlan from current state. Used only when the original
plan is fundamentally invalidated (e.g., prerequisite_gap reveals the learner is
missing foundations the entire plan assumed).

### 9.4 Selection rule

Always use the **lowest level that addresses the trigger**. If a local
adjustment can resolve the issue, do not escalate. Pedagogy Guardian rejects
replans that escalate unnecessarily.

---

## 10\. GAMIFICATION IS A DERIVED PRESENTATION LAYER

### 10.1 The principle

Gamification has **no independent state and no independent logic**. Every
gamification surface — XP, streaks, badges, achievements, Memory Integrity
Score, skill trees, Progressive Capability Revelation — is a **derived view**
computed from learning state.

The Gamification Service becomes a query/projection layer over data owned by the
Session, Scheduler, Metacognition, and Knowledge Graph services. Its own
database holds only presentation cache, not source-of-truth reward state.

### 10.2 Derivation rules

| Surface                           | Derived From                                                                                           |
| :-------------------------------- | :----------------------------------------------------------------------------------------------------- |
| XP                                | Cumulative `combined_score` across completed Steps, decayed over time                                  |
| Level                             | XP thresholds (presentation-only)                                                                      |
| Streak                            | Consecutive days with at least one Step where `reasoning_quality > R_STREAK_THRESHOLD`                 |
| Streak freeze                     | Preserved as a UI-only mechanic                                                                        |
| Achievements                      | Predicate evaluation against learning state (e.g., "5 stable concepts in domain X")                    |
| Mastery badges                    | `state == 'stable'` for concept, with duration computed from state-history                             |
| Memory Integrity Score            | Function over (current stable concept count, average reasoning_quality, time since last unstable flip) |
| Skill tree node "unlocked"        | Prerequisite concepts in `stable` state                                                                |
| Progressive Capability Revelation | Tier thresholds redefined on (Step count, average reasoning_quality, days active) — not Card count     |

### 10.3 Revocation

Because gamification is derived, **badges and achievements revoke
automatically** when underlying state changes. A "Stable for 90 days" badge
disappears the moment the concept flips to `unstable`. This is the correct
behavior: the badge represents a current truth, not a historical event.

### 10.4 Streak quality requirement

A streak day is only counted if the learner completed at least one Step where
`reasoning_quality > R_STREAK_THRESHOLD`. Mindless tapping through cards does
not extend a streak. This is the only gamification rule that requires active
enforcement (rather than passive derivation), because it gates the input rather
than computes the output.

### 10.5 Progressive Capability Revelation

Tier thresholds are redefined to use Step-level metrics:

Tier 1: 20 Steps completed, 3 categories engaged

Tier 2: 50 Steps completed, 5 categories engaged

Tier 3: 75 Steps, 7 categories, 7 days active, average reasoning_quality \> 0.5

Tier 4: 100 Steps, 10 categories, 14 days active, average reasoning_quality \>
0.55

Tier 5: 150 Steps, 50 sessions, 21 days active, average reasoning_quality \> 0.6

Tier 6: 200 Steps, 15 categories, 30 days active, average reasoning_quality \>
0.65

Numerical thresholds are approximations of existing ones, recomputed for the
Step-as-unit model. Tune empirically.

---

## 11\. PRESERVATION LIST — DO NOT REMOVE

The following must remain functional. If a refactor seems to require removing
one of these, **stop and reframe as wrapping or subordination** instead.

- All 22+ card types (become templates and content sources for Steps)
- All 30 epistemic modes (become eligibility-group members)
- FSRS, HLR, SM-2, Leitner schedulers (continue as scheduling math under the
  binary state view)
- The 7-frame Mental Debugger (now the primary evaluation mechanism)
- All 20 remediation card types
- Dual graph architecture (PKG / CKG) and the 7-layer guardrail stack
- 5-layer stratified reasoning model
- Microservice boundaries
- Event-driven architecture
- Offline-first sync
- Settings hierarchy and Last Known Good Configuration
- All mathematical foundations (category theory, CRDT islands, Bayesian belief
  dynamics, TLA+ verification)
- Decks and Categories (become content sources for LessonPlans)
- Memory Integrity Score (becomes derived per §10)
- Skill trees, achievements, badges (all become derived per §10)

Strategy Loadouts: keep if implemented and not crucial-blocking; remove only by
separate decision.

---

## 12\. PER-SERVICE CHANGE SUMMARY

### Session Service

- Add `Goal`, `LessonPlan`, `Step`, `Activity` entities
- Enforce 4-goal cap per LessonPlan
- Add lifecycle state machine:
  `Planning → Execution → Diagnosis → Adaptation → Evaluation → Completion`
- Every session has a LessonPlan (auto-generate minimal for review sessions)

### Content Service

- Add `compatible_transformations` field to Card
- Add `default_eligibility_groups` field to Card (which mode groups this card
  can serve)
- Add read API: `getCardsForGeneration(concept, transformation, mode)`
- Cards remain otherwise unchanged

### Scheduler Service

- Operate on Steps (concepts), not Cards
- Maintain three logical queues: `repair_queue`, `reinforcement_queue`,
  `new_learning_queue`
- FSRS continues internally; expose binary `state` per concept
- Track per-concept transformation history for §7 cycling

### Metacognition Service

- 7-frame trace produces `reasoning_quality` (deterministic mapping per frame)
- Produce full Evaluation object per §6.5
- Emit Triggers per §8.1
- Maintain per-concept reasoning_quality rolling average

### Strategy Service

- Subscribe to Trigger events
- Implement intervention map per §8.2
- Implement three replanning levels per §9
- Apply minimum sufficient change rule
- Strategy Loadouts (if kept): operate as delivery-style modifier
  post-mode-selection

### Knowledge Graph Service

- Add `state: 'stable' | 'unstable'` to concept nodes
- Add `confusable_with` edge type for confusion routing
- Expose `getPrerequisiteGaps(learner, concept)` for prerequisite_gap triggers

### Gamification Service

- Refactor from independent reward system to derived projection layer
- Remove independent state tables; replace with cached derivations
- Implement derivation rules per §10.2
- Implement streak quality gate per §10.4
- Recompute Progressive Capability Revelation thresholds per §10.5

### Ingestion Service

- Add post-ingestion auto-curriculum step: emit `concepts_extracted` event
- Pipeline:
  `upload → extract → rough_curriculum → begin_learning → refine_from_performance`

### Pedagogy Guardian (rename of Governance Agent)

- Validate every full-rigor LessonPlan before activation
- Validate every Step (objective present, evaluation_type defined, serves at
  least one goal)
- Validate replans (lowest sufficient level)
- Veto any agent proposal violating the principles in §1

### Other services (Analytics, Sync, Vector, Notification, Media, Collaboration)

- No functional changes
- Analytics: add `Reasoning Quality Over Time` dashboard per learner per concept

---

## 13\. ORDER OF IMPLEMENTATION

Each step is independently shippable. Follow this order to minimize breakage.

1. **Data model** — Add Goal, LessonPlan, Step, Activity, Trigger, ConceptState
   entities (no behavior change yet)
2. **Mode eligibility groups** — Encode §4.1 as a constants module; classify all
   30 modes
3. **Transformation types** — Add the 6-type enum; add
   `compatible_transformations` to Card
4. **Evaluation refactor** — Implement `reasoning_quality` extraction from
   7-frame trace; implement combination formula §6.3
5. **Trigger emission** — Convert existing diagnoses to Trigger events
6. **Scheduler refactor** — Move from Card-level to Step-level scheduling; add
   three queues; expose binary state
7. **State derivation** — Implement §3.2 binary state from FSRS \+ reasoning
   average
8. **Strategy Service** — Subscribe to Triggers; implement intervention map and
   replanning levels
9. **Pedagogy Guardian** — Rename Governance Agent; expand validation scope
10. **LessonPlan & Session lifecycle** — Wire LessonPlan into every session;
    enforce goal cap
11. **Content Generation Agent** — Implement variant generation per §7.4
12. **Gamification refactor** — Move to derived layer per §10
13. **Agent loop** — Wire the closed loop per §8.3

---

## 14\. SUCCESS CRITERIA

Realignment is complete when all of the following hold:

- A learner can start a session and the system always generates a LessonPlan
  (minimal or full)
- Every Step the learner sees has an explicit objective, selected epistemic
  mode, and evaluation type
- Every evaluation produces a `reasoning_quality` score and a combined_score
  from the §6.3 formula
- A learner who answers correctly with low `reasoning_quality` does not advance
  state to `stable`
- A learner who answers wrongly with high `reasoning_quality` does not
  necessarily flip to `unstable`
- A `confusion` trigger automatically routes the next Step to a mode in
  `GROUP_CONFUSION`
- A `failure` trigger lands the concept in the repair queue and re-presents with
  a different transformation
- A concept that flips from `stable` to `unstable` causes any derived badges to
  disappear in the UI
- A streak does not extend on a day with only low-reasoning-quality Steps
- The Pedagogy Guardian rejects at least one malformed agent proposal during
  testing
- All preserved features (§11) still function

---

## 15\. NON-GOALS

To prevent scope creep, this realignment is explicitly **not** about:

- Adding new card types
- Adding new epistemic modes
- Adding new microservices
- Changing the dual-graph architecture
- Changing offline-first sync semantics
- Changing the settings hierarchy
- UI/UX redesign (beyond the 3-choice self-rating)
- Mobile app architecture changes

If any of the above seem necessary to complete a task in this document, raise
the conflict for review rather than expanding scope.

---

**End of realignment specification.**

This document supersedes any conflicting guidance in other Noema documents. All
other documents remain valid where they do not conflict with this one.
