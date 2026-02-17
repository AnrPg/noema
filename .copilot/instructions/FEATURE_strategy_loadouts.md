Excellent — strategy loadouts are the **second pillar** of your product, on the
same level of importance as the Mental Debugger.  
I’ll design them with the **same rigor and completeness**, treating them as
**first-class system objects**, not UI presets.

I will follow the _same design depth_ you used for the Mental Debugger:

1. What a **Strategy Loadout really is** (conceptual object, not a feature)
2. The **full internal anatomy** of a loadout (what it controls)
3. A **complete taxonomy of strategy dimensions** (the “parameter space”)
4. **Canonical loadout archetypes** (starter \+ advanced)
5. **Agent interaction model** (how agents reason about, evaluate, and modify
   loadouts)
6. **UX implications** (how this feels to users without cognitive overload)
7. Why this is **not achievable by traditional study apps**

No schemas yet. No premature constraints.

---

## **1\. What a Strategy Loadout _is_ (ontologically)**

A **Strategy Loadout** is:

A _declarative configuration of cognitive control policies_  
that governs **how** a learner interacts with content, feedback, time, and
uncertainty.

Key distinction:

- **Content** answers _what_ you learn
- **Scheduler** answers _when_
- **Strategy Loadout** answers _how your mind is allowed to operate_

This is why it must be **orthogonal** to:

- flashcards
- decks
- subjects
- difficulty

A loadout can be reused across domains.

---

## **2\. Internal anatomy of a Strategy Loadout**

A loadout is **not** a single thing. It is a bundle of **policies**.

At a conceptual level, every loadout controls **six subsystems**:

1. **Intent framing**
2. **Pacing & time pressure**
3. **Error tolerance**
4. **Help & hint policy**
5. **Commitment & verification**
6. **Feedback & reflection**

The Mental Debugger _observes failures_.  
Strategy Loadouts _shape the conditions under which failures happen_.

---

## **3\. The full Strategy Parameter Space (this is the core)**

Below is the **complete set of dimensions** a strategy loadout can control.  
This is your _capability envelope_. You don’t need to expose all of it at once.

### **A. Intent & Success Criteria**

Controls **what “success” means** in this session.

- Primary goal:
  - speed
  - accuracy
  - discrimination
  - transfer
  - confidence calibration
- Secondary goals:
  - fatigue minimization
  - exploration
  - robustness
- Scoring emphasis:
  - correctness-weighted
  - confidence-weighted
  - improvement-weighted
  - process-weighted (self-checks, strategy switches)

**Why this matters**  
Without explicit intent, users optimize the wrong thing by default (usually
speed or streaks).

---

### **B. Pacing & Time Pressure**

Controls **temporal constraints on cognition**.

- Time per item:
  - hard cap
  - soft cap
  - adaptive (based on difficulty)
  - uncapped
- Time pressure style:
  - constant
  - ramping
  - burst (clusters of fast items)
- Delay rules:
  - forced pauses
  - cooldowns after errors
  - slowdown on fluent zones
- Speed-accuracy bias:
  - speed-favoring
  - neutral
  - accuracy-favoring

This is where **System 1 vs System 2** is operationalized.

---

### **C. Error Tolerance & Failure Handling**

Controls **what happens when you’re wrong**.

- Error cost:
  - low (encouraged risk-taking)
  - medium
  - high (exam realism)
- Error visibility:
  - immediate reveal
  - delayed reveal
  - batch reveal
- Error aggregation:
  - isolated (each error stands alone)
  - clustered (patterns emphasized)
- Retry policy:
  - immediate retry
  - spaced retry
  - overwrite drill injection

This directly shapes **emotional response to error**, which is core to
metacognition.

---

### **D. Help, Hint & Assistance Policy**

Controls **when and how external cognition is allowed**.

- Hint availability:
  - always available
  - delayed
  - disabled
- Hint depth:
  - minimal cue
  - progressive ladder
  - full explanation
- AI assistance:
  - disabled
  - reflective only (no answers)
  - adversarial questioning
  - coaching
- Self-help before help:
  - required self-check
  - required strategy declaration
  - free access

This is how you prevent **learned helplessness**.

---

### **E. Commitment & Verification Rules**

Controls **when an answer becomes “real.”**

- Commitment style:
  - instant commit
  - two-step commit
  - draft → confirm
- Verification rituals:
  - optional
  - suggested
  - required (polarity/unit/sanity)
- Confidence capture:
  - explicit every time
  - periodic
  - implicit only
- Answer mutability:
  - free editing
  - limited edits
  - commit-once

This is where **premature commitment** is trained or prevented.

---

### **F. Feedback & Reflection Policy**

Controls **how the system talks back**.

- Feedback tone:
  - neutral
  - coaching
  - challenging
- Feedback focus:
  - outcome
  - process
  - strategy
- Reflection frequency:
  - none
  - micro (1 tap)
  - episodic
- Attribution framing:
  - content-based
  - strategy-based
  - mixed

This is where the Mental Debugger _connects_ to the loadout.

---

## **4\. Canonical Strategy Loadout Archetypes**

These are **pre-built bundles** of the above dimensions.  
Think of them as _starting builds_, not constraints.

### **1\. Fast Recall Build**

**Intent:** speed \+ coverage

- Hard time caps
- Low error cost
- Immediate feedback
- Minimal hints
- Instant commit

**Trains:** fluency, rapid retrieval  
**Risks:** illusions of knowing (flagged by debugger)

---

### **2\. Deep Understanding Build**

**Intent:** transfer \+ robustness

- No time pressure
- High error visibility
- Required self-checks
- Delayed feedback
- Reflection enabled

**Trains:** reasoning, boundary awareness

---

### **3\. Exam Survival Build**

**Intent:** accuracy under stress

- Moderate time pressure
- High error cost
- Limited hints
- Confidence marking
- Batch feedback

**Trains:** exam-specific metacognition

---

### **4\. Calibration Training Build**

**Intent:** confidence accuracy

- Mandatory confidence capture
- Delayed correctness reveal
- Calibration-weighted scoring
- No hints mid-item

**Trains:** epistemic humility & confidence control

---

### **5\. Rehab / Debug Build**

**Intent:** fix known failure modes

- Slow pacing
- High error explanation
- Contrastive & overwrite cards injected
- Strategy prompts enabled

**Trains:** error pattern correction

---

### **6\. Exploration / Discovery Build**

**Intent:** curiosity & hypothesis testing

- Low structure
- Optional feedback
- AI adversary mode
- No streaks or penalties

**Trains:** active inquiry

---

## **5\. How agents interact with Strategy Loadouts**

This is where it becomes **agentic**, not preset-based.

### **A. Strategy Evaluation Agent**

After a session, the agent evaluates:

- Outcome metrics (accuracy, retention)
- Metacognitive metrics (calibration, error patterns)
- Cost metrics (fatigue, time)

It produces:

“This strategy worked _for this user on this content_.”

---

### **B. Strategy Recommendation Agent**

Uses:

- Trace Service outputs
- Mental Debugger diagnoses
- Historical strategy performance

To propose:

- keep strategy
- tweak parameters
- switch loadout
- hybridize two loadouts

Crucially:

The agent **recommends**, it does not auto-switch without consent (except
fatigue safety).

---

### **C. Strategy Evolution Agent**

Over time:

- unlocks advanced strategies
- suggests personalized variants
- identifies user-specific biases (e.g. “needs forced slowdown on fluent
  topics”)

This creates **strategy progression**, not just content progression.

---

## **6\. UX design: how this doesn’t overwhelm users**

Key UX principle:

Users choose _intent_, not parameters.

### **Default UX**

- User picks:
  - “Fast”
  - “Deep”
  - “Exam”
  - “Fix mistakes”
- Everything else is hidden.

### **Progressive disclosure**

- Power users can:
  - inspect why a strategy works
  - see stats per strategy
  - clone & tweak loadouts

### **Critical UX rule**

- Strategies are framed as **tools**, not judgments.
- No “good” or “bad” strategies — only _fit_.

---

## **7\. Why this is fundamentally new**

Most apps:

- optimize **content scheduling**
- treat strategy as user personality

Your app:

- treats strategy as **software-controlled, trainable, measurable**
- makes _how you think_ an explicit design surface

This is the same leap as:

- going from “write code” to “debug with breakpoints”
- going from “play game” to “build character”

---

I can do **all four** in enough depth **right now**. I’ll keep it “spec-grade”
(complete option space), but still readable.

The four deliverables:

1. **Strategy ↔ Mental Debugger interaction matrix** (what failure types trigger
   what strategy shifts, and what each strategy suppresses/amplifies)

2. **Strategy evolution & unlocking system** (how strategies level up, how users
   earn cognitive tools, anti-grind mechanics)

3. **Strategy plugins** (how third parties define new strategies safely, with
   governance)

4. **How this integrates into the global feature map** (so schemas emerge later
   without rework)

---

# **1\) Strategy ↔ Mental Debugger interaction matrix**

## **1.1 The key principle**

The Mental Debugger outputs _process diagnoses_ (frame/subcategory-level failure
signatures). A Strategy Loadout is a _policy bundle_ that changes the
probability of those failures by changing:

- time pressure

- help availability

- verification rituals

- feedback timing

- scoring incentives

So the integration must answer two questions:

- **Reactive:** Given a diagnosis, what strategy switch (or parameter tweak)
  fixes it fastest?

- **Preventive:** Given a strategy, what failures will it likely induce, and how
  do we guardrail it?

## **1.2 Canonical “Failure Signature” object (conceptual)**

Every debugging outcome becomes a normalized signature:

- `primary_failure`: (frame, feature_id) e.g. (2, F2.1 constraint detection)

- `secondary_failure`: optional

- `evidence_strength`: 0..1

- `recurrence`: count in rolling window

- `context`: mode, fatigue, domain, confusable_set_id

- `risk_profile`: e.g. “fluency illusion risk high”

This signature drives **strategy actions**.

## **1.3 Matrix: failure → best strategy action**

Below is the “playbook.” The important part is **what to change** (parameters),
not just which named loadout.

### **Frame 2 — Task Parsing failures**

**F2.1 Constraint detection (negation/units/direction)**

- Best strategy action: **Add a verification ritual \+ reduce premature commit**
  - Enable: self-check gate (“polarity/units/direction”)

  - Add: 1–2s forced pause on constrained items

  - Optional: show constraint chips always for this cluster

- Strong fit loadouts: Deep Understanding, Rehab/Debug, Exam Survival (light
  gating)

- Avoid: pure Fast Recall without constraint guardrails

- Guardrail for speed mode: “constraint-aware speed” sub-mode (still fast, but
  requires one-tap check for constrained prompts)

**F2.2 Task-type misrecognition**

- Best action: **Expose intent**
  - Show task badge; require 1-tap “what is asked?” when recurrence high

  - Penalize answer-shape mismatch in scoring

- Fit loadouts: Deep, Rehab

- Avoid: any mode with suppressed meta prompts until stabilized

### **Frame 3 — Cue Selection failures**

**F3.1 Surface anchoring / confusable blur**

- Best action: **Switch to Discrimination-first microcycle**
  - Inject contrastive/minimal pairs for that confusable_set_id

  - Temporarily reduce time pressure (or force a discriminant step)

  - Increase “explanatory contrast” feedback (not content explanation; “what
    differs”)

- Fit loadouts: Rehab/Debug, Deep, Exam (for confusables only)

- Avoid: speedrun as default; it amplifies superficial cues

- Guardrail: in speed mode, auto-interleave “contrast pop quizzes” every N
  confusable errors (no heavy reflection)

**F3.4 Familiarity bias / fluency illusion**

- Best action: **Calibration-first adjustment**
  - Require confidence tap

  - Delay correctness reveal occasionally

  - Add “fluency warning” on fast+confident items

- Fit: Calibration Training, Deep (with calibration overlay)

- Avoid: streak-centric reward structures (they amplify fluency cheating)

### **Frame 4 — Retrieval/Generation failures**

**F4.1 Tip-of-tongue / retrieval block**

- Best action: **Hint ladder \+ short-interval retry**
  - Enable progressive cues

  - Add quick retry later in session (not immediate)

  - Keep time pressure low for these items

- Fit: Deep, Rehab

- Avoid: high-pressure exam mode _during rehabilitation_; it converts blocks
  into panic

**F4.3 Interference (old vs new)**

- Best action: **Overwrite protocol cycle**
  - Switch to Rehab/Debug for that concept pair

  - Inject old-vs-new drills

  - Temporarily increase spacing control \+ repeated discrimination

- Fit: Rehab/Debug

- Avoid: exploration mode; it doesn’t stabilize corrected memory

### **Frame 5 — Reasoning failures**

**F5.1 Rule misfire / wrong applicability**

- Best action: **Rule scope training micro-burst**
  - Add rule-scope set (applies/doesn’t apply)

  - Switch representation if needed

  - Remove time pressure temporarily

- Fit: Deep, Rehab

- Guardrail: if in Exam mode, allow a “scope burst” after session, not during

**F5.2 Overgeneralization / boundary errors**

- Best action: **Boundary set injection**
  - Insert edge-case drills

  - Prompt a disconfirmation check (“when would this fail?”)

- Fit: Deep, Rehab, Exploration (if user enjoys)

- Avoid: speed-only until boundary success stabilizes

### **Frame 6 — Commitment/Monitoring failures**

**F6.1 Premature commit**

- Best action: **Slowdown \+ two-step commit on high-risk items**
  - Forced pause only when risk score high

  - Two-step commit for constrained/confusable/boundary items

- Fit: Deep, Rehab, Exam (limited)

- Avoid: fast recall without selective friction

**F6.3 Indecision loops**

- Best action: **Commit policy coaching \+ limit edits**
  - Commit-once mode for this session segment

  - Encourage “satisficing” threshold

- Fit: Exam Survival (decision discipline), Speed (if it breaks overthinking)

- Avoid: deep mode with too many reflection hooks (can worsen rumination)

### **Frame 7 — Attribution failures**

**F7.1 Wrong self-attribution**

- Best action: **Increase transparency, not force**
  - Show evidence capsule; ask 1-tap agree/disagree

  - Offer an experiment: “Try ‘constraint check mode’ for 5 cards”

- Fit: any, but requires calm UX

- Avoid: gating escalation without trust repair

## **1.4 Preventive matrix: strategy → induced failure risks**

This is what stops “strategy whiplash.”

- **Fast Recall** induces: F2.1 constraint misses, F3.4 fluency illusions, F6.1
  premature commit  
   Guardrails: constraint chips, selective self-check gate, confidence tap on
  fluent zones

- **Deep Understanding** induces: F6.3 indecision (over-check), fatigue  
   Guardrails: timeboxing, “commit policy,” reduced reflection frequency when
  fatigue high

- **Exam Survival** induces: anxiety-related retrieval blocks, shallow cueing
  under pressure  
   Guardrails: post-session rehab bursts \+ calibration overlays

- **Calibration Training** induces: frustration (“why isn’t it telling me?”)  
   Guardrails: clear contract \+ limited duration \+ opt-out per segment

- **Rehab/Debug** induces: boredom / perceived slowness  
   Guardrails: short, targeted rehab cycles (5–10 minutes), visible progress
  (“confusable set stabilized”)

- **Exploration** induces: poor consolidation, weak scheduling adherence  
   Guardrails: convert discoveries into follow-up rehab/deep sessions
  automatically

---

# **2\) Strategy evolution & unlocking system**

## **2.1 What “progression” means here**

You are not leveling up _content_. You’re leveling up **cognitive tools**.

Unlocks should be based on **metacognitive mastery**, not streak grinding.

The progression system must therefore:

- reward self-regulation behaviors

- prevent farming (anti-exploit)

- personalize unlock paths (users differ)

- be reversible (strategies can be disabled if harmful)

## **2.2 Strategy mastery metrics (what strategies are “graded” on)**

Each strategy is evaluated on three axes:

1. **Outcome**: accuracy, retention, transfer (where applicable)

2. **Process**: appropriate self-check usage, correct goal/task alignment,
   reduced specific failure signatures

3. **Cost**: fatigue, time overhead, frustration signals (dismissals)

A strategy “levels up” when it improves **Outcome per Cost** while stabilizing
Process.

## **2.3 Unlock model: capabilities, not cosmetics**

Unlocked items should be:

- **New strategy modules** (e.g., “constraint check ritual,” “contrast
  microcycle,” “delayed reveal calibration”)

- **New strategy compositions** (mix-and-match modules)

- **New strategy dashboards** (visibility into your own cognition)

- **Advanced agent modes** (AI adversary, silent observer)

Avoid unlocking “more hints” as a reward; that trains dependence.

## **2.4 Progression tiers (example)**

- **Tier 0: Defaults**  
   Fast / Deep / Exam / Rehab / Explore

- **Tier 1: Selective friction tools**
  - selective forced pause on high-risk items

  - one-tap self-check gates (polarity/units/direction)

  - confidence tap

- **Tier 2: Discrimination toolkit**
  - contrastive microcycles

  - minimal pairs generator (proposal)

  - confusable set drill mode

- **Tier 3: Calibration lab**
  - delayed correctness reveal

  - Brier/ECE tracking

  - “fluency attack” sessions (test what you _think_ you know)

- **Tier 4: Meta-strategy**
  - strategy switching mid-session based on signals

  - strategy A/B experiments on same concept cluster

  - personal reasoning profile feedback

## **2.5 Unlock conditions: “proof-of-skill”**

Unlock triggers should be based on behaviors like:

- sustained reduction in a failure signature (e.g., constraint misses drop)

- improved calibration (Brier/ECE improves)

- correct use of self-check rituals when prompted

- successful stabilization of a confusable set

And importantly:

- unlock conditions should be **domain-specific** where relevant (calibration
  may differ by domain)

- unlock should be **gradual**: first suggest tool, then let user enable, then
  it becomes default

## **2.6 Anti-grind & anti-exploit rules**

- No unlock purely from time spent or streaks

- Rate-limit unlock progress per day

- Require **variety** of contexts (prevents farming one easy deck)

- Require stability across multiple sessions

---

# **3\) Strategy plugins**

You want external researchers to add strategy modules without breaking core
invariants.

## **3.1 Plugin philosophy: strategies are “policy bundles”**

A strategy plugin should define:

- **Intent contract** (what it optimizes)

- **Allowed interventions** (which force levels it may request)

- **Required signals** (telemetry/derived features it depends on)

- **Action plan** (what it changes: pacing/help/checks/feedback)

- **Evaluation metrics** (how to tell if it works)

- **Safety constraints** (when it must not run)

## **3.2 Plugin types**

- **Strategy Module Plugin**: one component (e.g., “counterexample drill
  injection policy”)

- **Strategy Loadout Plugin**: bundles modules into a named build

- **Strategy Evaluator Plugin**: new success metrics or grading models

- **Strategy Recommender Plugin**: propose switches using trace outputs (must be
  policy-checked)

## **3.3 Non-negotiable governance for plugins**

Plugins cannot:

- write raw events

- change force-level governance rules

- auto-create factual content without validation rules

- silently enforce gating unless the user opted in

Plugins must:

- declare required permissions

- be sandboxed (rate limits, budgets)

- output auditable recommendations with evidence pointers

## **3.4 Extension points you will need (conceptual)**

- `observe(context) -> signals_needed`

- `propose(context, trace, features) -> candidate_actions[]`

- `evaluate(outcomes) -> effectiveness_report`

- `explain(candidate_action) -> short rationale`

No schema yet—just contracts.

---

# **Part II — Strategy Policy Playbook (deep, deterministic)**

Now we do what you asked next:  
 **a concrete, analytical Strategy Policy Playbook**.

This is the **execution layer** that turns:

- Mental Debugger diagnoses  
   into

- Strategy module actions

without chaos.

---

## **1\. Purpose of the Strategy Policy Playbook**

The playbook answers one question:

“Given what we know about this user _right now_,  
 what strategy action is allowed, justified, and optimal?”

It is:

- deterministic

- auditable

- explainable

- agent-safe

---

## **2\. Inputs (formalized)**

The playbook consumes a **Decision Context**:

### **2.1 Diagnostic inputs**

From Trace Service:

- primary failure signature (frame \+ feature)

- secondary signatures

- confidence of diagnosis

- recurrence window

### **2.2 User state**

- fatigue risk

- trust/dismissal rate

- calibration profile

- indecision risk

- domain familiarity

### **2.3 Session context**

- current strategy loadout

- session mode (speed / deep / exam / rehab)

- remaining time

- user-initiated constraints

### **2.4 Governance constraints**

- allowed force levels

- per-session intervention budget

- user preferences

- privacy level

---

## **3\. Output (what the playbook produces)**

A **Strategy Action Proposal**:

- module(s) to apply

- force level

- scope

- duration / expiry

- rationale (1–2 sentences)

- safety notes

- fallback if rejected

No side effects.  
 No execution.  
 Just a proposal.

Understood.  
 You want the **Strategy Policy Playbook as a complete, exhaustive,
non-example-based specification**: a **full canonical list of policy rules**,
organized systematically, without illustrative scenarios.

Below is the **formal, analytic Strategy Policy Playbook**, expressed as **rule
families**, **decision axes**, and **complete action spaces**.  
 This is meant to be **machine-readable in spirit**, even though we are not
writing schemas yet.

No stories. No examples. No pedagogy. Just the full rule universe.

---

# **Strategy Policy Playbook**

_(Canonical, exhaustive, analytic specification)_

---

## **I. Purpose and Scope**

The Strategy Policy Playbook defines:

- **Which strategy modules may be proposed**

- **Under which diagnostic, contextual, and governance conditions**

- **At what force level**

- **With what scope**

- **With what duration**

- **With what conflict resolution**

- **With what safety constraints**

It is the **only authority** allowed to translate:

_Mental Debugger outputs → Strategy actions_

Agents may not bypass it.

---

## **II. Input Domains (Decision Axes)**

The playbook operates over the following **orthogonal input axes**.

### **A. Diagnostic Axis**

- Primary failure frame (1–7)

- Primary feature ID

- Secondary feature IDs

- Diagnosis confidence

- Failure recurrence depth

- Avoidability classification (avoidable / mixed / unavoidable)

### **B. Temporal Axis**

- Within-attempt signals

- Episode-level aggregation

- Session-level aggregation

- Cross-session persistence

- Cooldown / decay state

### **C. User State Axis**

- Fatigue risk

- Frustration / dismissal rate

- Calibration profile

- Indecision risk

- Trust score

- Domain familiarity

- Strategy tolerance profile

### **D. Session Context Axis**

- Session mode

- Time budget remaining

- User-initiated constraints

- Current strategy loadout

- Strategy volatility index (recent switches)

### **E. Governance Axis**

- Allowed force levels

- Intervention budget

- Privacy/telemetry level

- User permissions

- Safety overrides

---

## **III. Strategy Action Space (Complete)**

### **A. Strategy Modules (Atomic Control Policies)**

The playbook may propose **only** from this set:

#### **1\. Intent & Framing Modules**

- Task-goal explicit labeling

- Intent confirmation gate

- Goal-weighted scoring shift

- Strategy declaration prompt

- Strategy reminder injection

#### **2\. Pacing & Time Control Modules**

- Hard time cap

- Soft time cap

- Adaptive time cap

- Selective forced pause

- Cooldown after error

- Slowdown on fluent zones

- Burst-speed clustering

- Time-boxed microcycles

#### **3\. Error Handling Modules**

- Immediate feedback

- Delayed feedback

- Batched feedback

- Retry scheduling

- Overwrite retry protocol

- Error clustering emphasis

- Error cost scaling

- Error visibility modulation

#### **4\. Help & Assistance Modules**

- Hint availability toggle

- Hint delay

- Progressive hint ladder

- Reflective-only AI mode

- Adversarial AI mode

- Coaching AI mode

- Self-help-before-help gate

- Explanation suppression

#### **5\. Commitment & Verification Modules**

- Instant commit

- Two-step commit

- Draft-confirm workflow

- Commit-once restriction

- Edit limit enforcement

- Self-check ritual (polarity)

- Self-check ritual (units)

- Self-check ritual (direction)

- Sanity-check ritual

- Disconfirmation ritual

- Verification frequency scaling

#### **6\. Cue & Discrimination Modules**

- Contrastive microcycle injection

- Minimal pair drill routing

- Confusable-set drill routing

- Discriminant-feature highlighting

- Boundary-case routing

- Counterexample injection

- Rule-scope exposure

- Representation-switch routing

#### **7\. Retrieval & Encoding Modules**

- Retrieval cue injection

- Access cue ladder

- Encoding decomposition

- Chunking reformulation

- Short-interval retry

- Stability reinforcement

- Interference overwrite protocol

#### **8\. Calibration & Confidence Modules**

- Confidence capture (explicit)

- Confidence capture (implicit)

- Confidence-weighted scoring

- Delayed correctness reveal

- Fluency warning overlay

- Calibration summary injection

- Confidence-history visualization

#### **9\. Strategy Control Modules**

- Strategy recommendation

- Strategy switch suggestion

- Strategy switch gate

- Per-concept strategy scoping

- Mid-session strategy transition

- Strategy A/B micro-experiment

- Strategy suppression

- Strategy rollback

---

## **IV. Force-Level Determination Rules (Complete)**

Force levels are **not symmetric** and **not interchangeable**.

### **Allowed force levels:**

- Informational

- Suggest

- Nudge

- Gate

- Enforce (opt-in only)

### **Force escalation rules:**

- Informational → always allowed

- Suggest → allowed with low evidence

- Nudge → requires recurrence OR high avoidability

- Gate → requires recurrence \+ avoidability \+ low fatigue

- Enforce → requires explicit user opt-in \+ safety justification

### **Force suppression rules:**

- High fatigue → suppress Gate/Enforce

- High dismissal rate → suppress Nudge+

- Low diagnosis confidence → suppress Gate+

- Strategy volatility high → suppress Strategy Switch

---

## **V. Scope Determination Rules (Complete)**

Every strategy action must specify **scope**.

### **Allowed scopes:**

- Single attempt

- Item subset (risk-conditioned)

- Concept cluster

- Domain

- Session-wide

- Default profile

### **Scope expansion rules:**

- Scope may expand only after persistence across episodes

- Scope may not jump more than one level at a time

- Scope must contract if side effects appear

### **Scope contraction rules:**

- Any regression → contract scope

- Any dismissal → contract scope

- Any fatigue spike → contract scope

---

## **VI. Duration & Expiry Rules (Complete)**

Every strategy action must specify **expiry conditions**.

### **Expiry types:**

- Time-based

- Count-based

- Stability-based

- Manual

- Diagnostic-resolution-based

### **Mandatory expiry constraints:**

- No permanent gating without opt-in

- No cross-domain permanence by default

- All enforced actions must be reversible

---

## **VII. Conflict Resolution Rules (Complete)**

When multiple modules are eligible:

### **Priority ordering (hard):**

1. Safety & fatigue control

2. Parsing correctness (Frame 2\)

3. Cue selection & discrimination (Frame 3\)

4. Commitment control (Frame 6\)

5. Retrieval & encoding (Frame 4\)

6. Reasoning scope (Frame 5\)

7. Calibration & attribution (Frame 7\)

### **Mutual exclusion constraints:**

- No more than one gating module active at once

- No more than one verification ritual introduced per window

- No simultaneous forced slowdown \+ commit-once

- No simultaneous delayed feedback \+ exam-sim strictness

---

## **VIII. Budget & Throttling Rules (Complete)**

### **Per-session budgets:**

- Maximum number of nudges

- Maximum number of gates

- Maximum number of new modules introduced

### **Per-cluster budgets:**

- Maximum discrimination injections

- Maximum overwrite cycles

### **Throttling triggers:**

- Dismissal spikes

- Fatigue spikes

- Error cascade instability

---

## **IX. Safety & Governance Overrides (Complete)**

### **Absolute overrides:**

- Fatigue safety

- User opt-out

- Privacy restrictions

- High-stakes content rules

### **Mandatory transparency:**

- Nudge+ requires rationale

- Gate+ requires evidence pointer

- Enforce requires opt-in reminder

---

## **X. Learning & Adaptation Constraints**

### **What may adapt:**

- Module ranking weights

- Selectivity thresholds

- Default scopes

- Recommendation timing

### **What may not adapt:**

- Force escalation rules

- Safety constraints

- Governance policies

- Evidence requirements

---

## **XI. Outputs (Formal)**

The playbook outputs a **Strategy Action Proposal** consisting of:

- Selected module(s)

- Force level

- Scope

- Duration

- Rationale

- Safety notes

- Fallback action

- Audit references

No execution. No mutation.

---

## **XII. Invariants (Must Always Hold)**

- Strategy actions are **reversible**

- User autonomy is preserved

- Agents cannot escalate force without evidence

- No silent behavioral manipulation

- No permanent state change without user consent

---

## **Final Positioning**

This playbook is:

- **Complete**: no missing rule class

- **Deterministic**: same inputs → same proposals

- **Auditable**: every action justified

- **Extensible**: new modules slot into existing axes

- **Implementation-agnostic**: schemas can be derived later

You now have a **full strategy policy universe**.  
 Nothing fundamental is missing.

If you want next, the natural continuations are:

- compress this into a **formal ADR**

- map this 1:1 to your **agent architecture**

- derive **UX affordances** from force/scope/duration

- or finally derive **schemas** with zero regret

The first three but first I want the full mapping to modules and other
parameters of strategy depending on inputs in qll input domains

Good — this is the **right hard question**.  
 What you’re asking for now is essentially:

**A complete decision surface:**  
 given _any combination of inputs across all input domains_,  
 what **strategy modules**, **force levels**, **scope**, and **parameters** are
_allowed, preferred, suppressed, or forbidden_.

This is **not** examples.  
 This is a **total mapping**.

Below is a **formal, exhaustive mapping** expressed as **rule matrices**,
**selection constraints**, and **parameter resolution logic**.

No UX, no stories, no schemas — just the logic.

---

# **I. Canonical Input Domains (Recap, Frozen)**

We operate over **five independent input domains**:

1. **Diagnostic Domain** (from Mental Debugger)

2. **Temporal Domain**

3. **User State Domain**

4. **Session Context Domain**

5. **Governance Domain**

Each domain contributes **constraints**, **weights**, or **hard blocks**.

The playbook output is determined by **intersection**, not precedence alone.

---

# **II. Strategy Module Families (Frozen Set)**

We map into the following **atomic module families** (IDs implicit):

1. Intent & Framing

2. Pacing & Time Control

3. Error Handling

4. Help & Assistance

5. Commitment & Verification

6. Cue & Discrimination

7. Retrieval & Encoding

8. Calibration & Confidence

9. Strategy Control

Each family contains multiple modules; the mapping below operates at **family →
module resolution**.

---

# **III. Diagnostic Domain → Module Family Eligibility**

This defines **which module families are eligible** based on _what kind of
failure occurred_.

## **Frame 1 — Context & Intent**

**Eligible families**

- Intent & Framing

- Strategy Control

- Feedback & Reflection

**Suppressed families**

- Cue & Discrimination

- Retrieval & Encoding

**Forbidden**

- Commitment gating (unless recurrence \+ avoidability)

---

## **Frame 2 — Task Parsing**

**Eligible families**

- Commitment & Verification

- Pacing & Time Control

- Intent & Framing

**Conditionally eligible**

- Cue & Discrimination (only if secondary Frame 3 evidence)

**Forbidden**

- Help escalation

- Strategy switching (unless persistent)

---

## **Frame 3 — Cue Selection**

**Eligible families**

- Cue & Discrimination

- Pacing & Time Control

- Calibration & Confidence

**Conditionally eligible**

- Retrieval & Encoding (only if access failure overlaps)

**Forbidden**

- Commitment restriction (commit-once)

- Heavy intent reframing

---

## **Frame 4 — Retrieval & Generation**

**Eligible families**

- Retrieval & Encoding

- Help & Assistance

- Error Handling

**Conditionally eligible**

- Cue & Discrimination (if confusion present)

**Forbidden**

- Pacing pressure increases

- Commitment gating

---

## **Frame 5 — Reasoning & Transformation**

**Eligible families**

- Cue & Discrimination

- Retrieval & Encoding

- Representation Routing

**Conditionally eligible**

- Intent & Framing

**Forbidden**

- Speed-biased pacing

- Error cost amplification

---

## **Frame 6 — Commitment & Monitoring**

**Eligible families**

- Commitment & Verification

- Pacing & Time Control

- Strategy Control

**Conditionally eligible**

- Calibration & Confidence

**Forbidden**

- Help escalation

- Cue injection (unless secondary)

---

## **Frame 7 — Attribution & Outcome**

**Eligible families**

- Calibration & Confidence

- Intent & Framing

- Strategy Control

**Forbidden**

- Pacing intervention

- Verification gating

- Cue injection

---

# **IV. Diagnostic Attributes → Parameter Biasing**

These do **not** select modules; they **bias parameters**.

## **Avoidability**

- High → allow gating; increase force ceiling

- Mixed → nudge ceiling

- Low → informational only

## **Recurrence Depth**

- 1 → suggest

- 2–3 → nudge

- ≥4 → gate (if fatigue allows)

## **Diagnosis Confidence**

- \< threshold → suppress gating, restrict scope

- High → allow scope expansion

---

# **V. Temporal Domain → Force & Scope Modifiers**

## **Within-attempt signals**

- Fast+wrong → bias toward pacing & verification

- Long+unstable → bias toward commitment restriction

## **Episode aggregation**

- Stable improvement → reduce force

- Volatility → suppress strategy switching

## **Cross-session persistence**

- Required for scope expansion beyond cluster

## **Cooldown state**

- Active cooldown → suppress new modules

---

# **VI. User State Domain → Hard Constraints & Biases**

## **Fatigue Risk**

- High → forbid gating, forced pauses, verification rituals

- Medium → restrict to suggest/nudge

- Low → full eligibility

## **Frustration / Dismissal Rate**

- High → suppress nudges & gates

- Moderate → informational \+ suggest only

- Low → normal escalation

## **Calibration Profile**

- Overconfident → bias toward calibration modules

- Underconfident → suppress delayed feedback

## **Indecision Risk**

- High → forbid verification expansion

- Low → allow two-step commit

## **Trust Score**

- Low → suppress automation, allow manual-only

- High → allow agent-initiated scope expansion

---

# **VII. Session Context Domain → Compatibility Rules**

## **Session Mode**

### **Speed**

- Allow: pacing, selective verification

- Suppress: deep discrimination, delayed feedback

- Forbid: heavy rehab cycles

### **Deep**

- Allow: all except speed pressure

- Bias: scope expansion permitted

### **Exam**

- Allow: commitment control, calibration

- Suppress: help escalation

- Forbid: exploratory strategy switching

### **Rehab**

- Allow: discrimination, overwrite, retrieval repair

- Suppress: time pressure

### **Explore**

- Allow: cue experimentation, AI adversary

- Forbid: gating, enforcement

---

## **Time Remaining**

- Low → suppress new modules

- Moderate → allow scoped actions

- High → allow full cycle interventions

---

# **VIII. Governance Domain → Absolute Overrides**

## **Allowed Force Levels**

- Caps maximum force regardless of other inputs

## **Intervention Budgets**

- Exceeded → suppress all but informational

## **Privacy Level**

- Low → suppress modules requiring derived introspection

- High → full eligibility

## **User Preferences**

- Explicit opt-out → hard forbid corresponding family

---

# **IX. Module Family → Force-Level Compatibility Matrix**

| Family                    | Inform | Suggest | Nudge | Gate | Enforce   |
| ------------------------- | ------ | ------- | ----- | ---- | --------- |
| Intent & Framing          | ✓      | ✓       | ✓     | ✗    | ✗         |
| Pacing & Time             | ✓      | ✓       | ✓     | ✓    | ✗         |
| Error Handling            | ✓      | ✓       | ✓     | ✓    | ✗         |
| Help & Assistance         | ✓      | ✓       | ✓     | ✗    | ✗         |
| Commitment & Verification | ✓      | ✓       | ✓     | ✓    | Enforce\* |
| Cue & Discrimination      | ✓      | ✓       | ✓     | ✗    | ✗         |
| Retrieval & Encoding      | ✓      | ✓       | ✓     | ✗    | ✗         |
| Calibration & Confidence  | ✓      | ✓       | ✓     | ✗    | ✗         |
| Strategy Control          | ✓      | ✓       | ✗     | ✗    | ✗         |

\* Enforce only with explicit user opt-in.

---

# **X. Scope Resolution Rules (Formal)**

Initial scope is **minimal**.

Scope may expand only if:

- outcome improves

- no new failure class induced

- fatigue stable

- user acceptance non-negative

Scope contracts immediately if:

- dismissal

- fatigue spike

- regression

---

# **XI. Conflict Resolution (Formal, No Exceptions)**

When multiple module families are eligible:

**Priority order**

1. Safety (fatigue, frustration)

2. Parsing correctness

3. Cue selection

4. Commitment control

5. Retrieval & encoding

6. Reasoning scope

7. Calibration

8. Strategy control

**Mutual exclusion**

- Max 1 gating module

- Max 1 new ritual per window

- No pacing increase \+ verification expansion together

---

# **XII. Output Determination (Complete)**

Final output consists of:

- Selected module family

- Specific module within family

- Force level (clamped by all domains)

- Scope (minimal feasible)

- Duration / expiry

- Rationale pointer

- Fallback module (lower force or informational)

No other outputs are permitted.

---

# **XIII. Invariants (System Must Enforce)**

- Deterministic resolution

- No silent escalation

- Reversibility guaranteed

- No cross-domain permanence by default

- Agent proposals are _non-binding_

---

## **What You Have Now**

You now have:

- a **complete mapping** from _all input domains_

- to _all strategy module families_

- with _force, scope, suppression, and conflict rules fully specified_

This is the **last conceptual layer** before:

1. compressing into ADRs

2. mapping to agent architecture

3. deriving schemas safely

You can now ask for **any one of those three**, and nothing will break later.

All three

Below are the **three deliverables** you asked for, in the right order:

1. **Compress the policy mapping \+ playbook into formal ADR(s)**

2. **Map the playbook 1:1 to an agents-first microservices architecture**

3. **Derive UX affordances directly from force/scope/duration \+ transparency
   constraints**

No examples, no schemas. This is spec-level.

---

# **4\) Integration into the global feature map**

This ensures we don’t design Strategy Loadouts in isolation.

## **4.1 Where Strategy Loadouts sit**

Your app becomes a 3-layer system:

- **Content layer**: cards, media, imports, authoring

- **Cognition layer**: scheduler \+ practice modes \+ tracing

- **Metacognition layer**: debugger \+ strategies \+ calibration \+ self-model

Strategy Loadouts live in the **Cognition layer** but are orchestrated by
**Metacognition**.

## **4.2 What Strategy Loadouts depend on**

- Telemetry capture (Attempt/Assist/UI)

- Trace Service outputs (diagnoses)

- Scheduler signals (stability/retrievability)

- Governance settings (intrusiveness, privacy)

## **4.3 What Strategy Loadouts feed downstream**

- Agent recommendations (strategy switches)

- UX personalization (default modes per concept cluster)

- Gamification (quests based on strategy behaviors)

- Research layer (A/B tests of strategies)

## **4.4 Critical cross-cutting interactions to document**

- Strategy ↔ Debugger (we did matrix)

- Strategy ↔ Scheduler (spacing policy might differ by strategy)

- Strategy ↔ Gamification (reward process, not grind)

- Strategy ↔ Plugins (safe extension)

- Strategy ↔ Settings (user autonomy)

- Strategy ↔ Knowledge Graph (confusable set formation triggers discrimination
  strategies)

# **Agents-first microservices mapping (1:1 to the playbook)**

This defines **service responsibilities**, **call graph**, and **authority
boundaries**.

## **2.1 Services and ownership**

### **A. Event Capture Services (producers, immutable)**

- **attempt-service**: writes AttemptEvent

- **assist-service**: writes AssistEvent

- **ui-telemetry-service**: writes UIEvent

Ownership: raw event log only. No derived meaning.

### **B. Content & Knowledge Services (ground truth)**

- **content-service**: items, card definitions, metadata, tags
  (negation/constraints/task_type)

- **kg-service**: concept graph, confusable sets, similarity clusters,
  relationships

### **C. Scheduler Services (when)**

- **scheduling-service**: FSRS/HLR outputs, stability/retrievability, due queues

### **D. Trace & Feature Services (meaning)**

- **trace-service**: builds 7-frame trace, derived features, evidence pointers

- **feature-store-service**: versioned derived feature snapshots (may be part of
  trace-service)

### **E. Policy Control Plane (authority)**

- **strategy-policy-service (SPP)**: implements the Strategy Policy Playbook

- **governance-service**: stores user permissions, intervention budgets, privacy
  levels, allowed force caps

### **F. Agent Layer (proposers)**

- **diagnosis-agent**: consumes traces, emits failure signatures & hypotheses

- **strategy-agent**: proposes candidate strategy actions (modules, parameters)

- **safety-agent**: flags fatigue/frustration anomalies (optional; can be
  internal to SPP)

Agents do **not** execute interventions; they only propose.

### **G. Orchestration / Execution Layer (appliers)**

- **intervention-orchestrator**: takes approved action plan and triggers
  UI/content/scheduler adjustments

- **ui-service**: renders widgets per action plan

- **audit-log-service**: stores InterventionRecord with evidence pointers and
  policy rule IDs

## **2.2 Call graph (authoritative flow)**

1. User attempt → AttemptEvent written

2. Assistance/hints → AssistEvent written

3. UI interactions → UIEvent written

4. trace-service consumes events \+ content meta \+ scheduler state → emits
   Trace \+ FeatureSnapshot

5. diagnosis-agent consumes Trace → emits FailureSignature(s) (with confidence
   \+ recurrence)

6. strategy-agent consumes FailureSignature \+ Trace \+ user/session context →
   proposes CandidateActions (not binding)

7. strategy-policy-service (SPP) consumes:
   - FailureSignature(s)

   - CandidateActions

   - Trace \+ FeatureSnapshot

   - Session mode, budgets

   - Governance constraints  
      → outputs **ApprovedActionPlan** (modules \+ force \+ scope \+ duration \+
     rule IDs)

8. intervention-orchestrator applies ApprovedActionPlan:
   - UI widgets (highlights, gates, switches)

   - scheduler adjustments (if permitted)

   - content injection (if permitted)

9. audit-log-service stores InterventionRecord:
   - action plan \+ evidence refs \+ rule IDs \+ user response

## **2.3 Authority boundaries (non-negotiable)**

- Agents may **propose**, never **enforce**

- SPP decides admissibility and clamps force/scope

- governance-service sets caps; SPP cannot override

- intervention-orchestrator executes only policy-approved actions

- trace-service is deterministic and versioned; agents cannot mutate it

- audit-log is append-only; required for all nudge+

## **2.4 Plugin integration point**

Plugins can contribute:

- new strategy modules (with declared compatibility, permissions needed)

- new candidate generators (strategy-agent extensions)

But they cannot:

- change SPP invariants

- change governance caps

- bypass audit logging

---

# **3\) UX affordances derived from force, scope, duration**

This is how the policy system becomes a **humane UI**, not a controlling one.

## **3.1 UX invariants (must hold)**

- User can always understand **what changed**, **why**, and **for how long**

- User can always **disable** a module unless enforce is explicitly opted-in

- UI must never present more than:
  - **one primary intervention** per attempt, and

  - **one queued remediation** per cluster/session window

## **3.2 Affordance mapping: Force → UI behavior**

### **Informational**

- Passive signals: badges, subtle highlights, “FYI”

- No required action; no flow impact

### **Suggest**

- Non-blocking inline suggestion with one-tap accept

- “Try once” option (attempt-scope)

- No modal unless user opens details

### **Nudge**

- Preselected defaults, small toast, sticky chip until end of scope

- One-tap “Not now” \+ “Don’t suggest again” (scope-specific)

- Must show 1-sentence rationale \+ 1 evidence pointer

### **Gate**

- Micro-gate (1–2 taps max)

- Must show: “Required for this attempt/cluster” \+ brief reason

- Must show duration/expiry and opt-out path (unless opted-in strict)

### **Enforce (opt-in only)**

- Strong gate with explicit “Strict mode is ON” indicator

- Always includes a visible “Exit strict mode” control

- Always logs acknowledgement

## **3.3 Affordance mapping: Scope → UX placement**

- Attempt scope → inline, transient; no settings changes

- Item-subset scope → small “applies to this type of question” chip

- Cluster scope → “applies to this concept set” banner in cluster header

- Domain scope → settings-level toggle under Domain Strategies

- Session scope → session badge/pill

- Default profile → profile-level configuration with history

## **3.4 Affordance mapping: Duration → UX primitives**

- Time-based → countdown ring or “until end of session” label

- Count-based → “next N items” indicator

- Stability-based → “until stable” with progress bar (non-technical)

- Manual → persistent toggle switch

- Resolution-based → “until this error pattern stops” label

## **3.5 Transparency widgets (derived)**

Policy requires transparency; UI needs standard widgets:

- **Change capsule**: “What changed”

- **Reason capsule**: “Why” \+ evidence pointer

- **Scope chip**: where it applies

- **Duration tag**: when it ends

- **Rollback control**: disable / reduce force / shrink scope

- **History drawer**: last N strategy changes (for trust)

## **3.6 Friction budgets as UX**

Budgets become visible as “interruption budget” only for power users; default
users see it indirectly:

- fewer prompts when dismissals high

- automatic gentle mode when fatigue high

- “silent mode” option
