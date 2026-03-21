Good — this confusion is actually a signal that the concept is **new in kind**,
not just in complexity. I’ll now explain the **“Stack Trace of Thinking”** as a
_single coherent mental process unfolding over time_, not as a list of parts.
I’ll also continuously anchor it to **how it would live inside your app and
UX**, so it never becomes abstract.

Think of this as the **runtime model of a learner’s mind during one attempt**.

---

When a learner interacts with your app, what looks like a simple action — seeing
a card and answering — is in fact a **temporal cascade of cognitive decisions**,
many of them unconscious. The “stack trace of thinking” is your way of
_reconstructing that cascade_ after the fact, just like a debugger reconstructs
how a program reached a crash.

Your app does **not** force the user to consciously step through these frames.
Instead, it **infers most of them**, occasionally asking the learner to confirm
or clarify. The goal is not introspection for its own sake, but **making
invisible cognitive control points observable and trainable**.

Let’s walk through the seven frames as one continuous experience.

---

### **Frame 1: Context & Intent — _Why am I doing this right now?_**

Before the learner even reads the content, their brain has already entered a
_mode_. This mode is shaped by the session type (speed practice, deep study,
exam simulation), their energy level, emotional state, time pressure, and
expectations. Two learners can see the exact same card but process it completely
differently depending on whether they think “this is a quick warm-up” or “this
is high-stakes exam prep.”

In your app, this frame is **partly explicit and partly inferred**. Explicitly,
the user may have chosen a session mode or strategy loadout (“fast recall”,
“deep understanding”). Implicitly, your system infers intent from behavior: how
fast they usually answer, whether they tolerate errors, how often they skip
explanations, whether they are fatigued.

UX-wise, this frame does _not_ interrupt the learner. It exists as a **silent
context banner** that affects everything downstream: time gates, feedback
strictness, hint availability, and how harsh the debugger will be. If a learner
answers quickly in “speedrun” mode, the system interprets mistakes differently
than if they were in “deep work” mode.

This frame answers: _What mental contract did the learner think they were
entering?_

---

### **Frame 2: Task Parsing — _What is being asked of me?_**

Now the learner reads the prompt. This is where many failures begin — not
because the learner lacks knowledge, but because they misinterpret the task. The
brain must decide: Is this asking for a definition, an example, a comparison, a
translation, an application, or a discrimination between similar items? It must
notice constraints like negations (“NOT”), quantifiers (“all”, “some”), units,
directionality, or multi-part instructions.

In your app, this frame is **highly inferable**. You know the task type. You
know whether the prompt contains negation or constraints. You can observe
whether the learner rereads the prompt or answers immediately. If they answer
incorrectly but their answer would have been correct for a _different_ task
type, you have strong evidence of a parsing failure.

UX-wise, this frame only becomes visible **when something goes wrong**. The
Mental Debugger may say, gently:

“It looks like you answered as if this was asking for X, but the task was asking
for Y.”

Over time, your app trains learners to pause and _parse intentionally_, without
ever lecturing them on “reading carefully.”

This frame answers: _What did the learner think the task was?_

---

### **Frame 3: Cue Selection — _What did I latch onto?_**

Once the task is parsed (correctly or not), the learner’s attention grabs onto
_something_. This might be a keyword, a familiar phrase, a visual shape, a
mnemonic, or even the memory of the previous card. This cue becomes the anchor
for everything that follows.

Cue selection is one of the most important and most under-trained cognitive
skills. Experts select **diagnostic cues**; novices select **superficial cues**.

In your app, cue selection is mostly **latent**, but its fingerprints are
everywhere. If a learner consistently confuses two similar concepts, they are
likely anchoring on a shared superficial feature. If they answer instantly based
on a single keyword, you can infer anchoring. If errors cluster after similar
cards, context leakage is likely.

UX-wise, this frame appears as _contrast interventions_. The app doesn’t say
“you chose the wrong cue”; instead it shows two items side by side and asks,
implicitly:

“What actually distinguishes these?”

Over time, learners internalize the habit of asking themselves that question
_before_ committing.

This frame answers: _What feature did the learner treat as decisive?_

---

### **Frame 4: Retrieval or Generation — _How did I produce a candidate answer?_**

At this point, the learner tries to produce an answer. This can happen in many
ways: direct recall, reconstruction from principles, elimination of options,
analogy, translation, or guessing. Sometimes the learner has partial knowledge
(“I know the definition but not the example”), sometimes they experience
tip-of-the-tongue states, sometimes interference from older memories blocks
access to newer ones.

Your app can infer this frame from **timing, hints, edits, and answer
dynamics**. Long hesitation followed by “I knew it” strongly suggests retrieval
failure, not ignorance. Fast wrong answers after recent exposure suggest
availability bias. Repeated use of the same wrong answer suggests interference.

UX-wise, this frame shows up when the app adapts _how_ it helps. Instead of
dumping an explanation, it may provide a retrieval cue, or re-expose
discriminating features, or schedule a stabilization review. The learner feels
helped, not judged.

This frame answers: _What cognitive mechanism generated the answer candidate?_

---

### **Frame 5: Reasoning & Transformation — _What did I do with that candidate?_**

Often, producing an answer isn’t enough. The learner may need to apply a rule,
translate between representations, compare options, or reason through
conditions. This is where misconceptions, overgeneralization, implicit
assumptions, and rule misfires live.

In your app, this frame is inferred through **error patterns**, not single
errors. If a learner consistently applies the same rule in inappropriate
contexts, that’s a reasoning failure. If they fail only on boundary cases,
that’s overgeneralization. If they never check assumptions, that’s a monitoring
gap feeding into reasoning errors.

UX-wise, this frame triggers **boundary-case cards, rule-scope reminders, and
disconfirmation prompts**. The system doesn’t say “your reasoning is wrong”; it
says “this rule works here, but not here — notice why.”

This frame answers: _How did the learner transform knowledge into a decision?_

---

### **Frame 6: Commitment & Monitoring — _Did I stop at the right time?_**

Eventually, the learner commits. But _when_ and _how_ they commit matters
enormously. Some learners answer too fast, mistaking fluency for correctness.
Others over-edit, trapped in indecision. Some never perform a self-check; others
check the wrong thing.

Your app observes this frame through **commit latency, edit instability, and
self-check behavior**. High confidence \+ fast \+ wrong is a classic premature
commit. Endless edits with no improvement signal indecision. Skipped
verification combined with avoidable errors signals missing self-check rituals.

UX-wise, this is where **flow control patches** appear: forced pauses, two-step
commits, required confidence declarations, or simple “check polarity” nudges.
These are not punishments; they are _training wheels for self-regulation_.

This frame answers: _How did the learner decide “this is good enough”?_

---

### **Frame 7: Outcome & Attribution — _Why did this happen, and what changes next time?_**

Finally, the learner sees the result. But the most important question is not
“was I right?”, it is “_why_ did this happen?” Humans are notoriously bad at
answering that. They blame memory when it was parsing, intelligence when it was
strategy, or the app when it was fatigue.

This frame is where your Mental Debugger truly lives. The system synthesizes
evidence from all previous frames and proposes a **process-based diagnosis**,
sometimes asking the learner to confirm or correct it. Over time, the learner’s
attributions become more accurate and less emotional.

UX-wise, this frame is calm, respectful, and actionable. Instead of “wrong”, the
app says something like:

“This looks like a boundary-case error. Let’s adjust how you check rules.”

And then it actually changes the future learning flow.

This frame answers: _What lesson does the learner extract from the outcome?_

---

### **The Whole Picture**

The key insight is this:

**A single mistake is not a point — it is a trajectory through these seven
frames.**

Your app does not force users to think about these frames. It **models them**,
uses them to decide _how_ to respond, and slowly trains learners to internalize
better control over each stage.

That’s why this is not just analytics, not just AI, and not just pedagogy.

It’s a **runtime model of thinking**.

Below is a **design spec for “Mental Debugger”** that fits your constraints:
**microservices, API-first, agents-first**, and an **LLM-driven orchestration
layer**.

I’ll give you:

1. **Feature workflow** (UX \+ data events)
2. The **full “stack trace of thinking” ontology** (stages \+ fields)
3. A **coverage matrix** (stage × failure mode families)
4. A **large failure taxonomy** (beyond semantic overgeneralization), with
   signals \+ interventions
5. How to drive it with **LLM agents** (roles, tools, prompts, and safety rails)
6. Suggested **microservices \+ API surfaces** (no code, but concrete)

---

## **1\) Mental Debugger: Workflow as a Product Mechanic**

### **Trigger conditions**

The debugger can trigger on:

- **Incorrect answer**
- **High confidence but slow** (illusion risk)
- **Correct answer but low confidence** (underconfidence)
- **Repeated hesitation / hint dependency**
- **Flip-flop** (changed answer)
- **Near-miss** (edit distance / partially correct)
- **Time pressure anomalies** (too fast/too slow relative to baseline)
- **Streak breaks** (sudden performance drop)

### **UX loop (fast path, minimal friction)**

**Step A — Snapshot**

- The app captures a _thinking trace snapshot_ from telemetry (timing, edits,
  hint usage, prior exposures, related items, last errors cluster).

**Step B — Post-mortem mode (15–30 seconds)**

- The user picks **1 primary failure cause** \+ optional **1 contributing
  factor**.
- If they don’t want to pick, they tap “Not sure” → agent proposes top 3 likely
  causes.

**Step C — Patch**

- The system generates a “patch”:
  - A micro-explanation (why you failed)
  - A micro-intervention (what to do next time)
  - Optional: an **auto-created remediation card** or **contrast card** or
    **anti-confusion pair**

**Step D — Regression prevention**

- Add a “watch rule” to detect recurrence:
  - “If user repeats same failure type on similar node, force slow thinking mode
    \+ contrast prompt.”

This makes metacognition **operational**: diagnose → patch → prevent regression.

---

## **2\) Full “Stack Trace of Their Thinking” Ontology**

Think of a trace as a structured object with these frames (you can log many
implicitly; only ask the user for 1–2 taps).

### **Frame 0 — Context / Intent**

- **Goal**: recall / recognize / apply / discriminate / explain / derive /
  transfer
- **Stakes mode**: practice / exam / speedrun / deep work
- **Strategy loadout**: fast recall / deep / elimination / mnemonic / analogical
- **Affective state (optional)**: calm / rushed / tired / anxious

### **Frame 1 — Task Parsing**

- **Task type**: definition, cloze, multi-choice, proof-step, translation,
  diagram labeling, etc.
- **What the prompt asked** (user paraphrase or agent paraphrase)
- **Constraints noticed**: units, polarity (“except”), quantifiers, language
  direction, etc.

### **Frame 2 — Cue Selection (What they latched onto)**

- **Primary cue**: keyword, image region, pattern, previous similar card,
  mnemonic hook
- **Cue quality**: diagnostic vs superficial
- **Cue conflicts** noticed or ignored

### **Frame 3 — Retrieval / Generation**

- **Retrieval mode**:
  - direct recall
  - reconstruct from principles
  - pattern completion
  - analogy
  - elimination
  - guess
- **Candidate set**: one candidate vs multiple competing candidates
- **Tip-of-tongue** marker (optional)

### **Frame 4 — Reasoning / Transformation**

- **Operation**: compare, map, calculate, infer, translate, generalize,
  specialize, apply rule
- **Assumptions used** (explicit or inferred)
- **Rule invoked** (explicit or implicit)

### **Frame 5 — Selection / Commitment**

- **Decision policy**:
  - pick strongest match
  - pick familiar
  - pick fastest
  - eliminate 2 then pick
- **Confidence estimate**
- **Time-to-commit** \+ number of edits

### **Frame 6 — Verification / Monitoring**

- **Self-check performed?**
  - re-read prompt
  - unit check
  - sanity check
  - opposite-case check
  - definition re-derivation
- **Stop condition**: “good enough”, time limit, certainty threshold

### **Frame 7 — Outcome & Attribution**

- **Outcome**: correct/incorrect/partial
- **Error type** (taxonomy below)
- **Cause**: knowledge gap vs control failure vs miscalibration vs attention vs
  language
- **Patch applied** (what changes next time)

That’s the full trace. In UI you’ll usually capture: frames 1, 3, 5, 7\.

---

## **3\) Coverage Matrix: Stage × Failure Families**

This is your “all possibilities” map at the _family_ level. (Each cell links to
specific failure subtypes in section 4.)

**Legend:**  
P \= Planning/Intent, T \= Task parsing, C \= Cue selection, R \=
Retrieval/Generation, X \= Reasoning/Transformation, S \= Selection/Commitment,
V \= Verification/Monitoring, A \= Attribution/Patch

| Failure family ↓ \\ Stage →                          | P   | T   | C   | R   | X   | S   | V   | A   |
| ---------------------------------------------------- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Attention & perception**                           |     | ✅  | ✅  |     |     | ✅  | ✅  |     |
| **Instruction/constraint misread**                   |     | ✅  |     |     | ✅  | ✅  | ✅  |     |
| **Cue misselection (superficial features)**          |     |     | ✅  | ✅  | ✅  | ✅  |     |     |
| **Memory availability illusion (fluency)**           | ✅  |     | ✅  | ✅  |     | ✅  | ✅  | ✅  |
| **Retrieval failure (tip-of-tongue / interference)** |     |     |     | ✅  |     | ✅  |     | ✅  |
| **Confusion between similar items**                  |     |     | ✅  | ✅  | ✅  | ✅  |     | ✅  |
| **Conceptual misconception**                         |     |     |     | ✅  | ✅  | ✅  | ✅  | ✅  |
| **Overgeneralization / undergeneralization**         |     |     |     |     | ✅  | ✅  | ✅  | ✅  |
| **Procedural/rule misuse**                           |     |     |     |     | ✅  | ✅  | ✅  | ✅  |
| **Language/translation drift**                       |     | ✅  | ✅  | ✅  | ✅  | ✅  | ✅  | ✅  |
| **Miscalibration (confidence error)**                | ✅  |     |     |     |     | ✅  | ✅  | ✅  |
| **Time pressure / speed-accuracy distortion**        | ✅  | ✅  | ✅  | ✅  | ✅  | ✅  | ✅  | ✅  |
| **Poor self-check / premature commit**               |     |     |     |     | ✅  | ✅  | ✅  | ✅  |
| **Attribution error (wrong diagnosis)**              |     |     |     |     |     |     |     | ✅  |

This matrix is “complete” in the sense that any metacognitive failure can be
located as **(stage, family)**, then refined to a subtype.

---

## **4\) Expanded Failure Categories (Subtypes) \+ Elaborations**

Here are **rich subtypes** beyond semantic overgeneralization, grouped by
family. For each I give: _what it is_, typical _signals_, and _best patch_.

### **A) Task Parsing & Instruction Failures**

1. **Negation blindness** (“Which is NOT…”, “except” missed)

- Signals: fast response; wrong polarity; user didn’t re-read prompt
- Patch: force “polarity highlight” \+ rephrase prompt

2. **Quantifier slip** (all/some/most, necessary/sufficient confusion)

- Signals: systematic errors on logic cards; high confidence
- Patch: contrast pairs \+ “quantifier check” ritual

3. **Unit/constraint omission** (mg vs g, direction EN→GR, time window,
   condition)

- Signals: answers right concept but wrong form
- Patch: “constraint checklist” micro-step before commit

4. **Goal mismatch** (explaining vs naming vs applying)

- Signals: user gives a definition when asked for an example
- Patch: “task type banner” \+ enforced answer format

---

### **B) Cue Selection Failures (the classic “latched onto the wrong thing”)**

5. **Surface-feature anchoring** (keyword match, visual resemblance)

- Signals: errors cluster on similar-looking terms/cards
- Patch: build “anti-cue” cards that remove the superficial cue

6. **Context leakage** (using previous card’s context)

- Signals: error right after similar item; sequential dependency
- Patch: interleave spacing \+ randomization \+ context-reset pause

7. **False friend cue** (linguistic cognates, similar roots)

- Signals: language learning: consistent wrong mapping
- Patch: contrastive dictionary card \+ minimal pairs

---

### **C) Retrieval & Memory Interference**

8. **Tip-of-tongue** (knows it but can’t retrieve)

- Signals: long hesitation; hints requested; “I knew it”
- Patch: retrieval cues training \+ phonological cue option \+ shorter cards

9. **Proactive interference** (old memory blocks new)

- Signals: always answers with older variant
- Patch: “overwrite protocol”: new vs old shown together; schedule heavy
  contrasts early

10. **Retroactive interference** (new memory corrupts old)

- Signals: recent learning causes old errors
- Patch: “stabilization set” review after introducing new similar items

11. **Availability bias** (recently seen answer feels right)

- Signals: wrong but fast; recent exposure
- Patch: spaced mixing \+ “why not?” prompts

---

### **D) Similarity Confusions (critical for flashcards)**

12. **Category boundary confusion** (two concepts overlap, user lacks
    discriminants)

- Signals: alternating between two labels; low confidence
- Patch: discriminant features card: “If X then not Y”

13. **Near-neighbor swap** (two items differ by one feature)

- Patch: “one-feature toggle” exercises (same stem, feature toggled)

14. **Schema slotting error** (placed concept in wrong mental slot)

- Patch: concept map \+ “where does this belong?” mini-task

---

### **E) Reasoning / Rule Application Failures**

15. **Rule misfire** (applied correct rule in wrong context)

- Signals: consistent wrong method
- Patch: rule applicability card: “When to use / when not to use”

16. **Condition inversion** (if/only if reversal)

- Patch: necessary/sufficient drills \+ counterexample generator

17. **Implicit assumption error** (assumed continuity, linearity, typical case)

- Patch: “assumption surfacing” prompt: “What must be true for your answer to
  hold?”

18. **Semantic overgeneralization** (your example)

- Patch: add counterexamples \+ boundary cases

19. **Undergeneralization** (too narrow; misses broader class)

- Patch: “find 3 other contexts” prompt

20. **Analogical overreach** (analogy used beyond validity region)

- Patch: analogy validity guardrails: “What differs here?”

21. **Causal story fallacy** (prefers coherent story over mechanism)

- Patch: mechanism-first explanation card \+ “predict intervention outcome” test

---

### **F) Selection / Commitment Failures**

22. **Premature commit** (stops too early)

- Signals: very fast; no verification; high confidence wrong
- Patch: “two-second check” gate for certain risk profiles

23. **Over-editing / indecision loop**

- Signals: many changes; time blowups
- Patch: force “commit once” mode \+ reduced options

24. **Default-to-familiar** (chooses most familiar answer)

- Patch: show “familiarity warning” if confidence high \+ speed high

---

### **G) Verification / Monitoring Failures**

25. **No self-check ritual**

- Patch: teach 1 domain-specific self-check (units, sign, definition)

26. **Self-check executed but wrong** (checked the wrong thing)

- Patch: “verification targets” list (polarity, constraints, discriminants)

27. **Confirmation bias in checking** (only looks for support)

- Patch: force disconfirmation prompt: “What would make this wrong?”

---

### **H) Calibration Failures (metacognition core)**

28. **Overconfidence (illusion of knowing)**

- Patch: confidence calibration training \+ delayed feedback sometimes

29. **Underconfidence (hidden competence)**

- Patch: strengthen evidence signals: “You got 7/9; trust your method”

30. **Poor uncertainty expression** (“I don’t know” when it’s partial)

- Patch: multi-level answers (“I can define but can’t apply”)

---

### **I) Attribution Failures (the meta-failure)**

31. **Wrong diagnosis** (blames memory when it’s parsing)

- Patch: agent suggests top likely causes based on telemetry \+ asks 1
  clarifying tap

32. **Ability attribution** (“I’m dumb”) instead of process attribution

- Patch: reframe: “This was a quantifier slip, not a knowledge gap.”

This taxonomy is intentionally _product-actionable_: each type maps to a **patch
mechanic**.

---

## **5\) How This Is Driven by LLM Agents (Agents-First)**

You want agents as primary actors, not “LLM sprinkled on top”. Here’s an
agents-first decomposition.

### **Agent roles**

1. **Trace Assembler Agent**

- Input: raw telemetry \+ item metadata \+ user history
- Output: structured trace (frames 0–7) with missing fields marked as “unknown”

2. **Failure Classifier Agent**

- Input: trace \+ (optional) user’s chosen label
- Output: ranked failure hypotheses \+ confidence \+ evidence pointers
- Uses: your taxonomy \+ “similar past traces” retrieval (vector DB)

3. **Patch Generator Agent**

- Input: failure subtype \+ item content \+ user profile
- Output: specific intervention(s):
  - micro-coaching script
  - remediation card template
  - contrast pair suggestion
  - schedule adjustment suggestion
- Must obey constraints: short, domain-appropriate, no hallucinated facts

4. **Watchtower Agent (Regression Detector)**

- Monitors streams of events
- Detects repeated patterns → triggers safeguards:
  - forced slow mode
  - forced contrast mode
  - forced “disconfirm” check
  - escalates to deeper diagnostic flow

5. **Taxonomy Curator Agent (offline / admin)**

- Suggests new subtypes if many traces don’t fit well
- Requires human approval (important governance)

### **Tools these agents call (non-LLM services)**

- **Telemetry query tool** (get attempts, timing, hints, edits)
- **Content retrieval tool** (card, deck, concept graph neighbors)
- **User model tool** (calibration curve, fatigue indicators)
- **Scheduler tool** (FSRS/HLR policy adjustments)
- **Card generator tool** (create contrast/remediation cards with human review
  settings)
- **Vector search tool** (similar traces, similar errors)

### **Why LLMs help here (and where they shouldn’t)**

LLMs are excellent at:

- mapping messy signals → structured diagnosis
- generating natural-language “patch” coaching
- creating contrast pairs / minimal pairs

LLMs should NOT be the source of truth for:

- domain facts (unless you have grounded sources)
- grading correctness (use deterministic validators when possible)

So: LLMs operate on **process \+ language**, while correctness uses
**validators**.

---

## **6\) Microservices \+ API-First Surfaces**

A clean split that matches your architecture:

### **Core services**

- **attempt-service**: stores attempts \+ telemetry
- **trace-service**: builds/returns structured thinking traces
- **debugger-service**: owns taxonomy, classification results, interventions,
  and “patch history”
- **coach-service**: delivers micro-interventions, scripts, UX payloads
- **scheduler-service**: FSRS/HLR scheduling and rule overrides
- **content-service**: cards/decks/knowledge graph
- **agent-orchestrator**: routes to agents, manages tool calls, audit logs

### **Key API concepts (concrete, not code)**

- `POST /attempts` (attempt event \+ telemetry)
- `POST /debugger/sessions` (create post-mortem session for attempt)
- `GET /debugger/sessions/{id}` (includes trace \+ ranked failure hypotheses)
- `POST /debugger/sessions/{id}/label` (user picks failure type)
- `POST /debugger/sessions/{id}/patch` (generate and apply patch)
- `GET /debugger/taxonomy` (versioned ontology)
- `POST /watchtower/rules` (create/update regression triggers)

### **Governance / audit (important for agents-first)**

Every agent output should include:

- **taxonomy version**
- **evidence pointers** (telemetry features used)
- **confidence score**
- **human override flag**
- **reproducibility key** (same inputs → same outputs if temperature=0)

---

## **What we should design next (still within “Mental Debugger”)**

To proceed “one feature at a time”, the next step is to lock 3 things:

1. **Taxonomy v0**: the set of failure subtypes you will support in MVP
2. **Telemetry MVP**: the minimum signals needed to classify reliably
3. **Patch repertoire**: for each subtype, what interventions exist (and which
   are automated vs manual)

If you want, I’ll do that next as a **mapping**:

**Failure subtype → required signals → patch actions → microservice owner →
agent role → UI widget**

…and that becomes your implementation blueprint.

Got it. Below is a **full-blown, “design-the-whole-space” spec** for the Mental
Debugger, locking the _complete_ option space for:

1. **Taxonomy (all failure families \+ subtypes \+ dimensions \+ parameters)**
2. **Telemetry (all signals \+ parameters \+ derived features \+ privacy
   knobs)**
3. **Patch repertoire (all intervention primitives \+ parameters \+ escalation
   policies)**  
   …and then a **master mapping model** you can use to generate an action plan
   (and implement progressively without redesign).

This is written **agents-first**, **API-first**, **microservices**, and assumes
you’ll run this as a **versioned ontology \+ rule/agent hybrid** (not a fixed
hardcoded list).

---

# **A. TAXONOMY: Complete “Stack Trace of Thinking” \+ Failure Space**

## **A1) Canonical Thinking Stack Trace (Frames \+ Fields)**

Treat a “thinking trace” as a _structured trace object_ composed of frames. Each
frame has **capturable fields**, some explicit (user input), some implicit
(telemetry), some inferred (agent).

### **Frame F0 — Context / Intent**

**Fields (option space):**

- `goal_type`: {recall, recognize, discriminate, explain, apply, transfer,
  derive, create, evaluate}
- `stakes_mode`: {practice, exam_sim, speedrun, deep_work, review_only,
  rehab_after_error}
- `motivation_state` (optional): {curious, neutral, pressured, bored, avoidant}
- `energy_state` (optional): {fresh, ok, tired, exhausted}
- `strategy_loadout_id` (link) \+ `strategy_override`: {none, user_selected,
  system_forced}
- `environment` (optional): {mobile, desktop, commute, noisy, multitasking}
- `time_budget_policy`: {none, soft_limit, hard_limit}
- `help_policy`: {hints_allowed, hints_delayed, hints_forbidden}

### **Frame F1 — Task Parsing**

- `task_type`: (your card type taxonomy)
- `instruction_features`: {negation_present, quantifiers_present,
  conditionals_present, multi_constraints, units_present,
  directionality_present, multi_step}
- `prompt_focus`: {definition, example, mechanism, comparison, procedure,
  mapping, equation, translation, label, diagnosis}
- `user_paraphrase` (optional)
- `parsing_confidence` (optional): {low, med, high}

### **Frame F2 — Cue Selection (what the mind latched onto)**

- `primary_cue_type`: {keyword, phrase, visual_region, prior_item, mnemonic,
  schema_slot, emotional_tag, phonetic, layout, number/unit, “looks familiar”}
- `cue_diagnosticity`: {diagnostic, semi, superficial, unknown}
- `cue_conflict_detected`: boolean
- `alternative_cues_considered`: count

### **Frame F3 — Retrieval / Generation**

- `retrieval_mode`: {direct_recall, reconstruct, recognition, elimination,
  analogy, guess, compute, translate, search_memory_path}
- `candidate_count`: {1, 2-3, 4+}
- `interference_marker`: {none, proactive, retroactive, mixed, unknown}
- `TOT_marker`: boolean (tip-of-tongue)
- `partial_knowledge`: {none, gist_only, definition_only, procedure_only,
  example_only}

### **Frame F4 — Reasoning / Transformation**

- `operation_type`: {compare, map, infer, calculate, translate, generalize,
  specialize, simulate, explain_causally, prove_step, classify}
- `rule_invoked`: {explicit_rule_id, none, unknown}
- `assumption_set`: list (explicit or inferred)
- `representation_used`: {verbal, symbolic, diagram, mental_image, formula,
  code, mixed}
- `working_memory_load_proxy`: {low, med, high}

### **Frame F5 — Selection / Commitment**

- `decision_policy`: {best_match, familiarity, speed, elimination_then_pick,
  risk_averse, risk_seeking, random_guess}
- `confidence`: numeric 0..1 \+ `confidence_source`: {explicit, inferred, mixed}
- `commit_latency_ms`
- `edit_count`
- `answer_switch`: boolean

### **Frame F6 — Verification / Monitoring**

- `self_check_used`: {none, reread_prompt, unit_check, polarity_check,
  sanity_check, counterexample_check, definition_rederive, backtranslate,
  boundary_case, explain_out_loud}
- `disconfirmation_attempted`: boolean
- `stop_condition`: {time_limit, certainty_threshold, fatigue, “good_enough”,
  forced_next}

### **Frame F7 — Outcome & Attribution**

- `outcome`: {correct, incorrect, partial, timeout, gave_up}
- `error_severity`: {minor_format, conceptual, procedural,
  safety_critical_if_real_world}
- `failure_type`: (taxonomy below)
- `user_reported_cause` (optional)
- `patch_applied`: list of patch IDs
- `watch_rules_added`: list

This stack trace is your **global schema**. Everything else
(taxonomy/telemetry/patches) attaches to it.

---

## **A2) Failure Taxonomy: Full Space (Families → Subtypes → Attributes)**

Design it as a **multi-label** classifier:

- **Primary failure** (one) \+ **contributing factors** (0–3)
- Each failure has **attributes**: detectability, typical signals, suggested
  patches, severity, domain affinity.

### **Family 1 — Task Parsing & Instruction Interpretation**

Subtypes:

1. Negation blindness (NOT/EXCEPT)
2. Quantifier slip (all/some/most; necessary/sufficient)
3. Condition misread (if/only-if, unless, boundary conditions)
4. Constraint omission (units, direction, format constraints)
5. Goal mismatch (answered wrong task type)
6. Multi-part prompt collapse (ignored sub-question)
7. Label/definition confusion (asked for name, gave description or vice versa)
8. Reference resolution error (pronouns/“this/that” ambiguity in prompt)
9. Language direction mistake (L1↔L2 swapped)

### **Family 2 — Attention / Perception / Input Processing**

1. Skimming / missed token
2. Visual mislocalization (looked at wrong image region)
3. Number transposition (12 vs 21\)
4. Sign/polarity slip (+/−)
5. Similar glyph confusion (l/1, O/0)
6. Distraction interruption (context switch)
7. Fatigue-induced lapse
8. Working memory overflow (lost earlier constraint mid-way)

### **Family 3 — Cue Selection Failures**

1. Surface-feature anchoring (keyword/shape match)
2. Spurious cue learning (learned a non-causal cue)
3. False friend cue (cognates, near-translation)
4. Context leakage (previous item primes answer)
5. Mnemonic over-trust (mnemonic wrong/outdated)
6. Schema slot miscue (placed into wrong category frame)
7. Authority cue bias (chooses “sounds formal”)
8. Familiarity bias (feels known → chooses)

### **Family 4 — Retrieval Failures & Memory Dynamics**

1. Tip-of-tongue
2. Retrieval-induced forgetting (recent retrieval harms others)
3. Proactive interference (old → blocks new)
4. Retroactive interference (new → corrupts old)
5. Availability bias (recently seen feels right)
6. Context-dependent recall failure (needs original context)
7. Weak encoding (never formed good trace)
8. Fragmented knowledge (pieces exist, can’t assemble)
9. Overcompression (gist retained, discriminants lost)

### **Family 5 — Similarity Confusions (Discrimination)**

1. Near-neighbor swap (one-feature difference)
2. Category boundary blur (overlap; missing discriminants)
3. Prototype trap (chooses typical example; misses atypical)
4. Many-to-one mapping confusion (multiple concepts map to same word)
5. One-to-many mapping confusion (polysemy)
6. Confusable set saturation (too many similar items introduced together)
7. Hierarchy confusion (superclass vs subclass)

### **Family 6 — Reasoning / Rule Application Errors**

1. Rule misfire (right rule wrong context)
2. Rule omission (should apply rule but didn’t)
3. Procedural step error (correct method, wrong step)
4. Semantic overgeneralization (applied too broadly)
5. Undergeneralization (too narrow; missed transfer)
6. Assumption error (implicit assumption false)
7. Causal story fallacy (coherent story \> mechanism)
8. Analogy overreach (analogy invalid outside region)
9. Circular reasoning (used conclusion as premise)
10. Correlation–causation slip (domain dependent)
11. Mis-specified objective (optimized wrong criterion)
12. Incomplete proof/derivation check (skipped justification)

### **Family 7 — Verification / Monitoring Failures**

1. No self-check ritual
2. Wrong self-check target (checked units but error was polarity)
3. Confirmation bias in checking
4. Premature stop (stopped when uncertain)
5. Overchecking loop (paralysis; too many edits)
6. Failed disconfirmation (couldn’t generate counterexample)
7. Misinterpreted feedback (learned wrong lesson)
8. Not updating beliefs after correction (stubborn prior)

### **Family 8 — Commitment / Decision Policy Failures**

1. Premature commit (speed over accuracy)
2. Default-to-familiar
3. Default-to-first-option (primacy bias)
4. Overweight recent hint
5. Risk-averse under-answering (won’t commit)
6. Random guess under pressure
7. Inconsistent policy (changes approach unpredictably)

### **Family 9 — Calibration / Metacognitive Monitoring**

1. Overconfidence (high conf wrong)
2. Underconfidence (low conf right)
3. Poor uncertainty granularity (“don’t know” when partial)
4. Miscalibrated confidence by domain (good in vocab, bad in logic)
5. Dunning–Kruger pocket (local)
6. Learned helplessness attribution pattern
7. Inflated certainty from fluency (fast \= sure)
8. Inflated certainty from repetition (seen often \= known)

### **Family 10 — Attribution Errors (Meta-failure)**

1. Wrong diagnosis (blamed memory vs parsing)
2. Ability attribution (“I’m dumb”) instead of process
3. External blame only (teacher/app) with no actionable change
4. Overfitting diagnosis (one failure type used for everything)
5. Ignoring contributing factors (single-cause bias)

**This taxonomy is the “complete listing”**. Your action plan is to implement it
progressively, but you won’t redesign it.

---

## **A3) Coverage Matrix: Stage × Failure Families (Complete)**

You already saw the family-level matrix earlier; the full version is:

- Each failure subtype is anchored to:
  - **primary stage**: {F1..F7} (from stack trace frames)
  - **secondary stage(s)**: optional list
  - **dominant mechanism**: {attention, parsing, cue, retrieval, reasoning,
    policy, monitoring, calibration, attribution}

This makes classification robust and allows “stack traces” like:

Task parsing slip \+ surface cue anchoring \+ premature commit

---

# **B. TELEMETRY: Complete Signal Space \+ Parameters**

You want “all parameters and options.” So we define telemetry as:

1. **Raw event stream** (low-level)
2. **Derived features** (computed)
3. **User model state** (longitudinal)
4. **Privacy / governance knobs**

## **B1) Raw Event Stream (Attempt Telemetry)**

### **Timing & interaction**

- `time_to_first_input_ms`
- `time_to_first_hint_ms`
- `time_to_commit_ms`
- `total_time_ms`
- `idle_segments`: list(duration_ms)
- `focus_lost_events`: count
- `scroll_events`: count (if relevant)
- `copy_paste_detected`: boolean (optional; sensitive)

### **Answer dynamics**

- `edit_count`
- `backspace_count` (for typed)
- `option_hover_dwell` (MCQ)
- `answer_switch`: boolean
- `candidate_cycle_count` (if user cycles options)
- `final_answer_length` (free response)
- `edit_distance_to_correct` (if correct known)
- `partial_credit_components`: list

### **Help behavior**

- `hint_count`
- `hint_levels_used`: \[0..N\] (progressive hints)
- `hint_dwell_time_ms`
- `explanation_viewed`: boolean
- `explanation_dwell_time_ms`
- `asked_ai_help`: boolean
- `ai_help_turns`: count

### **Confidence capture options**

- Explicit:
  - `confidence_slider_0_100`
  - `confidence_bucket`: {guess, low, medium, high, certain}
- Implicit:
  - `rt_based_confidence`
  - `hesitation_markers`
  - `edit_instability_score`

### **Self-check capture options**

- `self_check_prompt_shown`: boolean
- `self_check_completed`: boolean
- `self_check_type_selected`: enum (from F6 list)
- `disconfirmation_prompt_shown/completed`

### **Session context**

- `session_id`
- `session_mode`: {speed, deep, exam_sim, rehab}
- `time_budget_policy`
- `device_context`: {mobile, desktop, tablet}
- `network_state` (optional)
- `environment_tags` (optional user input)

## **B2) Content & Knowledge Graph Signals**

- `item_id`, `item_type`, `domain`
- `concept_node_ids` (KG links)
- `similarity_cluster_id`
- `neighbors_presented`: list(item_id)
- `has_negation`, `has_quantifiers`, `has_units`, `has_multi_constraints`
- `difficulty_estimate`: numeric
- `stability_estimate`: numeric (scheduler)
- `confusables_set_id`: for discrimination drills

## **B3) History & Scheduling Signals**

- `review_count_total`
- `last_seen_at`, `next_due_at`
- `retrievability_estimate` (FSRS/HLR)
- `forgetting_curve_params` (if HLR)
- `lag_since_last_review`
- `lapse_count`
- `interleaving_index` (how mixed the deck is)
- `spacing_quality_index`

## **B4) Derived Features (computed by analytics/trace service)**

These are classification gold.

### **Response geometry**

- `speed_zscore` vs personal baseline
- `rt_variance_recent`
- `edit_rate` \= edits / time
- `hesitation_index` (idle \+ edit oscillations)
- `instability_index` (switching \+ edits \+ hover dwell)

### **Error patterning**

- `error_streak_len`
- `confusion_pair_frequency`
- `same_wrong_answer_repetition`
- `post_hint_error_rate`
- `post_explanation_retention` (did it help next time?)

### **Calibration metrics**

- `brier_score_recent`
- `ece_recent` (expected calibration error)
- `overconfidence_rate` (conf\>0.8 wrong)
- `underconfidence_rate` (conf\<0.3 right)
- `confidence_slope_by_domain`

### **Interference metrics**

- `proactive_interference_score` (old answer recurring after update)
- `retroactive_interference_score` (old accuracy drop after new intro)
- `neighbor_contamination_score` (context leakage probability)

### **Parsing risk metrics**

- `negation_risk` (negation \+ fast \+ no reread)
- `constraint_risk`
- `quantifier_risk`

## **B5) Privacy / Governance knobs (must exist)**

- `telemetry_level`: {minimal, standard, research, developer}
- `store_raw_text_input`: {never, on_device_only, encrypted_server, user_opt_in}
- `store_ai_prompts`: {redacted, hashed, full_opt_in}
- `retention_policy`: duration per signal class
- `user_exportability`: full export of traces \+ decisions
- `audit_log_required`: boolean (for agent actions)

This prevents the “agents-first” architecture from becoming a compliance
nightmare later.

---

# **C. PATCH REPERTOIRE: Complete Intervention Space \+ Parameters**

Patches are **primitives** that can be composed into sequences. Each patch has:

- `trigger_conditions` (rule \+ model)
- `delivery_mode` (UI)
- `content_generation_mode` (static template vs LLM vs hybrid)
- `duration_cost` (seconds)
- `expected_effect` (what metric should improve)
- `escalation_path` (if repeats)

## **C1) Patch Primitive Catalog (Complete)**

### **C1.1 Micro-coaching & Explanations**

- **E1 Micro-explanation** (1–2 sentences)
- **E2 Mechanism explanation** (why it was wrong, not content dump)
- **E3 “What to check next time”** (ritual)
- **E4 “Why-not” disconfirmation prompt** (find counterexample)
- **E5 Attribution reframing** (process not ability)

Parameters:

- `tone`: {neutral, encouraging, strict, playful}
- `verbosity`: {1,2,3}
- `domain_style`: {math_rigorous, language_teacher, med_school, etc.}
- `max_tokens`, `citations_required` (if you ground)

### **C1.2 Card-level Remediation Generation**

- **R1 Contrast card** (X vs Y)
- **R2 Minimal pair** (one-feature toggle)
- **R3 Boundary case set** (edge conditions)
- **R4 Discriminant feature table** (if X then not Y)
- **R5 Rule scope card** (when to use / when not)
- **R6 Anti-cue card** (remove superficial cue)
- **R7 Rewrite prompt card** (same content, different phrasing)
- **R8 Back-translation card** (for languages)
- **R9 Retrieval cue card** (phonetic/semantic hooks)

Parameters:

- `auto_add_policy`: {suggest_only, add_to_inbox, auto_add}
- `review_priority`: numeric
- `requires_human_review`: boolean (per user setting)
- `max_new_cards_per_day`

### **C1.3 Flow/UX Control Patches (metacognition gates)**

- **G1 Forced slow mode** (minimum time before submit)
- **G2 Two-step commit** (draft → confirm)
- **G3 Verification gate** (must choose check type)
- **G4 Polarity highlight** (negation/except)
- **G5 Constraint checklist** (units, direction, format)
- **G6 Confidence required** (must declare)
- **G7 Disconfirmation required** (must state why wrong alternative is wrong)

Parameters:

- `gate_strength`: {soft_nudge, hard_block}
- `cooldown_after_trigger`: attempts
- `exempt_if_fatigue_high`: boolean

### **C1.4 Scheduling & Curriculum Patches**

- **S1 Interleave confusables** (separate or mix)
- **S2 Stabilization burst** (extra reviews after new similar intro)
- **S3 Overwrite protocol** (old vs new shown together)
- **S4 Spacing adjustment** (FSRS/HLR parameter tweak)
- **S5 Difficulty re-estimation** (item or concept)
- **S6 “Confusable quarantine”** (pause one set temporarily)

Parameters:

- `scheduler_policy_override_duration`
- `confusable_set_size`
- `max_extra_reviews`

### **C1.5 Calibration Training Modules**

- **C1 Calibration mini-game** (predict confidence; score)
- **C2 Delayed feedback** (force self-eval before reveal)
- **C3 Confidence histogram \+ coaching**
- **C4 Domain-specific calibration drills**
- **C5 “Fluency warning” mode** (fast answers trigger caution)

Parameters:

- `calibration_target_metric`: {Brier, ECE, overconfidence_rate}
- `training_frequency`
- `reward_scheme` (gamification)

### **C1.6 Deep Diagnostic Patches (when repeats)**

- **D1 Guided post-mortem** (3 questions)
- **D2 Think-aloud capture** (voice)
- **D3 Strategy loadout suggestion** (switch build)
- **D4 Micro-lesson injection** (short content only if truly missing)
- **D5 Human tutor escalation** (optional future)

Parameters:

- `escalation_threshold`: repeats in window
- `max_intrusiveness`

This patch set is the **complete design space**; implement subsets
progressively.

---

# **D. MASTER MAPPING MODEL: Failure → Signals → Patches → Services → Agents → UI**

Instead of a single static table (which would be enormous), you want a
**generative mapping** with all parameters. Here’s the canonical mapping schema.

## **D1) Mapping Record Schema (one per failure subtype)**

Each subtype has:

- `failure_id`
- `primary_stage` (F0..F7)
- `contributing_factors_allowed`: list(failure_id)
- `required_signals`: list(signal_id)
- `supporting_signals`: list(signal_id)
- `derived_features`: list(feature_id)
- `decision_logic`:
  - `rules`: deterministic predicates
  - `model`: optional classifier scoring
  - `confidence_thresholds`
- `patch_plan`:
  - `immediate_patches`: list(patch_id)
  - `optional_patches`: list(patch_id)
  - `escalation_patches`: list(patch_id)
  - `scheduler_actions`: list(action_id)
- `ownership`:
  - `service_owner`: {trace, debugger, coach, content, scheduler, watchtower}
  - `agent_roles`: list(agent_id)
- `ui_components`: list(component_id)
- `success_metrics`: list(metric_id)
- `cooldown_policy`

That is your universal action plan structure.

---

## **D2) Full Mapping (Representative Complete Set)**

Below I’ll give **complete mapping entries** for each **family**, but in a
parameterized way so it scales to every subtype.

### **Family 1: Task Parsing**

**Detect with**: `has_negation/constraints/quantifiers` \+ `speed_zscore` \+
`self_check_used` \+ error.  
**Immediate patches**: gates \+ micro coaching.

- Negation blindness
  - Required: `has_negation`, `time_to_commit_ms`, `self_check_used`,
    `correctness`
  - Derived: `negation_risk`
  - Patches: G4 (polarity highlight) \+ G3 (verification gate “polarity check”)
    \+ E3
  - Escalation: D1 guided post-mortem \+ R7 rewrite prompt cards
- Quantifier slip
  - Required: `has_quantifiers`, outcome, confidence
  - Patches: R5 rule scope \+ R3 boundary cases \+ G7 disconfirmation
- Constraint omission
  - Required: `has_constraints`, partial credit, format mismatch
  - Patches: G5 checklist \+ E3 \+ R7

### **Family 2: Attention/Perception**

**Detect with**: `focus_lost_events`, `idle_segments`, `number_transposition`,
`edit_instability`.  
**Immediate patches**: slow mode \+ self-check \+ environment suggestions.

- Skimming / missed token
  - Patches: G1 forced slow \+ G3 verification \+ E3 (“re-read prompt”)
- Visual mislocalization
  - Patches: UI zoom/highlight regions \+ R7 “same question, different crop”

### **Family 3: Cue Selection**

**Detect with**: confusable clusters \+ fast wrong \+ repeated pattern.  
**Patches**: anti-cue cards, minimal pairs, interleaving.

- Surface anchoring
  - Patches: R6 anti-cue \+ R1 contrast \+ C5 fluency warning
- Context leakage
  - Patches: S1 interleave policy \+ watchtower rule to insert buffer items \+
    E1 note
- False friend cue
  - Patches: R2 minimal pairs \+ R8 back-translation \+ R4 discriminants

### **Family 4: Retrieval/Memory**

**Detect with**: long RT \+ hints \+ “knew it” \+ TOT.  
**Patches**: retrieval cues \+ encoding improvements \+ stabilization.

- Tip-of-tongue
  - Patches: R9 retrieval cues \+ E3 “cue ladder” \+ scheduler short-interval
    retry
- Proactive interference
  - Patches: S3 overwrite protocol \+ R1 contrast \+ S2 stabilization burst
- Availability bias
  - Patches: G7 disconfirmation \+ S1 interleave \+ E4 “why-not”

### **Family 5: Similarity Confusion**

**Detect with**: toggling answers across same confusable set, neighbor
contamination score.  
**Patches**: discriminant tables, minimal pairs, confusable drills.

- Category boundary blur
  - Patches: R4 discriminants \+ R1 contrast \+ D1 guided post-mortem (ask
    discriminant)
- Near-neighbor swap
  - Patches: R2 minimal pair toggle \+ drill mode “one-feature switch”

### **Family 6: Reasoning/Rule**

**Detect with**: consistent wrong method or boundary failures.  
**Patches**: rule scope, counterexamples, assumption surfacing.

- Rule misfire
  - Patches: R5 rule scope \+ R1 contrast (“use rule vs don’t”) \+ G7 disconfirm
- Overgeneralization
  - Patches: R3 boundary cases \+ E4 counterexample check ritual
- Assumption error
  - Patches: D1 guided postmortem question “What must be true?” \+ R3

### **Family 7: Monitoring**

**Detect with**: `self_check_used == none` \+ high conf wrong \+ fast.  
**Patches**: verification rituals, gates.

- No self-check
  - Patches: G3 verification gate \+ E3 teach one ritual \+ watchtower repeat
    enforcement
- Confirmation bias
  - Patches: G7 disconfirmation required \+ E4

### **Family 8: Commitment**

**Detect with**: premature commit metrics, instability metrics.  
**Patches**: two-step commit, forced pause, policy coaching.

- Premature commit
  - Patches: G1 forced slow \+ G2 two-step \+ C5 fluency warning
- Indecision loop
  - Patches: commit-once mode for a block \+ reduce options \+ D3 strategy
    suggestion

### **Family 9: Calibration**

**Detect with**: Brier/ECE, overconfidence/underconfidence rates.  
**Patches**: calibration modules \+ delayed feedback.

- Overconfidence
  - Patches: C1 calibration game \+ C2 delayed feedback \+ E5 reframing
- Underconfidence
  - Patches: C3 confidence evidence \+ domain-specific calibration drills

### **Family 10: Attribution**

**Detect with**: user-selected cause mismatches telemetry \+ repeated wrong
diagnoses.  
**Patches**: “most likely cause” suggestion \+ guided questions.

- Wrong diagnosis
  - Patches: D1 guided postmortem \+ E1 (“Based on signals, this looks like …”)
    \+ show evidence

This gives you the full action plan structure without pretending a single flat
table can carry “all possibilities” cleanly.

---

# **E. AGENTS-FIRST: How LLM Agents Drive This End-to-End**

You asked specifically “how could all these be driven by LLM agents?” Here’s the
complete agent system with all parameters/options.

## **E1) Core Agent Roles (Online)**

1. **Trace Assembler Agent**

- Inputs: raw events \+ content metadata \+ user model snapshot
- Output: structured trace frames F0–F7 with `unknown` fields tagged
- Tools: attempt-service, content-service, scheduler-service, analytics-service

2. **Failure Classifier Agent**

- Output: ranked list of `(failure_id, score, evidence_features)`
- Mode: hybrid (rules first, LLM second)
- Tools: taxonomy-service, vector search (similar traces)

3. **Patch Planner Agent**

- Output: patch plan object (immediate/optional/escalation)
- Must respect: intrusiveness budget, time cost budget, user settings
- Tools: coach-service, content-gen-service, scheduler-service

4. **Coach Delivery Agent**

- Formats patches into UI payloads and microcopy
- Tools: none (pure generation), must stay within allowed templates

5. **Watchtower Agent**

- Runs as stream processor: detects recurrence → triggers gating or curriculum
  actions
- Tools: rule-engine-service, scheduler-service

## **E2) Offline / Admin Agents**

6. **Taxonomy Curator Agent**

- Proposes new subtypes / merges / splits
- Requires human approval; outputs migration plan (taxonomy vN → vN+1)

7. **Prompt & Policy Auditor Agent**

- Ensures patches are non-hallucinatory, non-harmful, consistent
- Flags risky generations

## **E3) Agent Parameters (must be in your config)**

- `temperature` per agent (classifier low; coach medium)
- `max_tool_calls`
- `tool_allowlist` per role
- `evidence_requirement`: {none, minimal, strict}
- `confidence_thresholds` for action
- `intrusiveness_budget` per session/user
- `fallback_policy` (if LLM fails → rules only)

---

# **F. MICROSERVICES & API SURFACES (Complete)**

You want microservices \+ API-first. This is the complete decomposition.

## **Services**

- **attempt-service**: append-only attempt events (raw)
- **analytics-service**: computes derived features
- **trace-service**: assembles F0–F7 traces
- **taxonomy-service**: versioned ontology \+ mapping records
- **debugger-service**: owns sessions, diagnoses, evidence
- **coach-service**: patch planning \+ delivery payloads
- **content-service**: creates remediation/contrast cards (optionally
  human-reviewed)
- **scheduler-service**: FSRS/HLR scheduling \+ overrides \+ confusable policies
- **watchtower-service**: streaming detection \+ enforcement
- **agent-orchestrator**: tool routing \+ audit logs \+ replay

## **API objects (key resources)**

- `Attempt`
- `Trace`
- `DebuggerSession`
- `Diagnosis`
- `PatchPlan`
- `PatchDelivery`
- `WatchRule`
- `TaxonomyVersion`
- `MappingRecord`

Each should be **versioned** and **replayable**.

---

# **G. YOUR ACTION PLAN (No redesign needed)**

Here’s the practical way to execute this “full-blown design”:

## **Phase 1 — Foundations**

- Implement Attempt \+ Feature extraction \+ Trace schema
- Implement Taxonomy service with versioning
- Implement MappingRecord schema (even if sparse initially)

## **Phase 2 — Diagnose \+ Patch minimal loop**

- Add classifier agent (rules+LLM)
- Add patch planner (limited subset)
- Start collecting labels (“user-reported cause”) for learning

## **Phase 3 — Expand coverage**

- Implement full patch primitives progressively
- Enable watchtower enforcement
- Add calibration training modules

## **Phase 4 — Governance & plugins**

- Add taxonomy curator workflow with migrations
- Allow plugins: new failure types \+ patches \+ detectors

---

When a learner interacts with your app, what looks like a simple action — seeing
a card and answering — is in fact a temporal cascade of cognitive decisions,
many of them unconscious. The “stack trace of thinking” is your way of
reconstructing that cascade after the fact, just like a debugger reconstructs
how a program reached a crash.

Your app does not force the user to consciously step through these frames.
Instead, it infers most of them, occasionally asking the learner to confirm or
clarify. The goal is not introspection for its own sake, but making invisible
cognitive control points observable and trainable.

Let’s walk through the seven frames as one continuous experience.

Frame 1: Context & Intent — Why am I doing this right now?

Before the learner even reads the content, their brain has already entered a
mode. This mode is shaped by the session type (speed practice, deep study, exam
simulation), their energy level, emotional state, time pressure, and
expectations. Two learners can see the exact same card but process it completely
differently depending on whether they think “this is a quick warm-up” or “this
is high-stakes exam prep.”

In your app, this frame is partly explicit and partly inferred. Explicitly, the
user may have chosen a session mode or strategy loadout (“fast recall”, “deep
understanding”). Implicitly, your system infers intent from behavior: how fast
they usually answer, whether they tolerate errors, how often they skip
explanations, whether they are fatigued.

UX-wise, this frame does not interrupt the learner. It exists as a silent
context banner that affects everything downstream: time gates, feedback
strictness, hint availability, and how harsh the debugger will be. If a learner
answers quickly in “speedrun” mode, the system interprets mistakes differently
than if they were in “deep work” mode.

This frame answers: What mental contract did the learner think they were
entering?

Frame 2: Task Parsing — What is being asked of me?

Now the learner reads the prompt. This is where many failures begin — not
because the learner lacks knowledge, but because they misinterpret the task. The
brain must decide: Is this asking for a definition, an example, a comparison, a
translation, an application, or a discrimination between similar items? It must
notice constraints like negations (“NOT”), quantifiers (“all”, “some”), units,
directionality, or multi-part instructions.

In your app, this frame is highly inferable. You know the task type. You know
whether the prompt contains negation or constraints. You can observe whether the
learner rereads the prompt or answers immediately. If they answer incorrectly
but their answer would have been correct for a different task type, you have
strong evidence of a parsing failure.

UX-wise, this frame only becomes visible when something goes wrong. The Mental
Debugger may say, gently:

“It looks like you answered as if this was asking for X, but the task was asking
for Y.”

Over time, your app trains learners to pause and parse intentionally, without
ever lecturing them on “reading carefully.”

This frame answers: What did the learner think the task was?

Frame 3: Cue Selection — What did I latch onto?

Once the task is parsed (correctly or not), the learner’s attention grabs onto
something. This might be a keyword, a familiar phrase, a visual shape, a
mnemonic, or even the memory of the previous card. This cue becomes the anchor
for everything that follows.

Cue selection is one of the most important and most under-trained cognitive
skills. Experts select diagnostic cues; novices select superficial cues.

In your app, cue selection is mostly latent, but its fingerprints are
everywhere. If a learner consistently confuses two similar concepts, they are
likely anchoring on a shared superficial feature. If they answer instantly based
on a single keyword, you can infer anchoring. If errors cluster after similar
cards, context leakage is likely.

UX-wise, this frame appears as contrast interventions. The app doesn’t say “you
chose the wrong cue”; instead it shows two items side by side and asks,
implicitly:

“What actually distinguishes these?”

Over time, learners internalize the habit of asking themselves that question
before committing.

This frame answers: What feature did the learner treat as decisive?

Frame 4: Retrieval or Generation — How did I produce a candidate answer?

At this point, the learner tries to produce an answer. This can happen in many
ways: direct recall, reconstruction from principles, elimination of options,
analogy, translation, or guessing. Sometimes the learner has partial knowledge
(“I know the definition but not the example”), sometimes they experience
tip-of-the-tongue states, sometimes interference from older memories blocks
access to newer ones.

Your app can infer this frame from timing, hints, edits, and answer dynamics.
Long hesitation followed by “I knew it” strongly suggests retrieval failure, not
ignorance. Fast wrong answers after recent exposure suggest availability bias.
Repeated use of the same wrong answer suggests interference.

UX-wise, this frame shows up when the app adapts how it helps. Instead of
dumping an explanation, it may provide a retrieval cue, or re-expose
discriminating features, or schedule a stabilization review. The learner feels
helped, not judged.

This frame answers: What cognitive mechanism generated the answer candidate?

Frame 5: Reasoning & Transformation — What did I do with that candidate?

Often, producing an answer isn’t enough. The learner may need to apply a rule,
translate between representations, compare options, or reason through
conditions. This is where misconceptions, overgeneralization, implicit
assumptions, and rule misfires live.

In your app, this frame is inferred through error patterns, not single errors.
If a learner consistently applies the same rule in inappropriate contexts,
that’s a reasoning failure. If they fail only on boundary cases, that’s
overgeneralization. If they never check assumptions, that’s a monitoring gap
feeding into reasoning errors.

UX-wise, this frame triggers boundary-case cards, rule-scope reminders, and
disconfirmation prompts. The system doesn’t say “your reasoning is wrong”; it
says “this rule works here, but not here — notice why.”

This frame answers: How did the learner transform knowledge into a decision?

Frame 6: Commitment & Monitoring — Did I stop at the right time?

Eventually, the learner commits. But when and how they commit matters
enormously. Some learners answer too fast, mistaking fluency for correctness.
Others over-edit, trapped in indecision. Some never perform a self-check; others
check the wrong thing.

Your app observes this frame through commit latency, edit instability, and
self-check behavior. High confidence \+ fast \+ wrong is a classic premature
commit. Endless edits with no improvement signal indecision. Skipped
verification combined with avoidable errors signals missing self-check rituals.

UX-wise, this is where flow control patches appear: forced pauses, two-step
commits, required confidence declarations, or simple “check polarity” nudges.
These are not punishments; they are training wheels for self-regulation.

This frame answers: How did the learner decide “this is good enough”?

Frame 7: Outcome & Attribution — Why did this happen, and what changes next
time?

Finally, the learner sees the result. But the most important question is not
“was I right?”, it is “why did this happen?” Humans are notoriously bad at
answering that. They blame memory when it was parsing, intelligence when it was
strategy, or the app when it was fatigue.

This frame is where your Mental Debugger truly lives. The system synthesizes
evidence from all previous frames and proposes a process-based diagnosis,
sometimes asking the learner to confirm or correct it. Over time, the learner’s
attributions become more accurate and less emotional.

UX-wise, this frame is calm, respectful, and actionable. Instead of “wrong”, the
app says something like:

“This looks like a boundary-case error. Let’s adjust how you check rules.”

And then it actually changes the future learning flow.

This frame answers: What lesson does the learner extract from the outcome?

The Whole Picture

The key insight is this:

A single mistake is not a point — it is a trajectory through these seven frames.

Your app does not force users to think about these frames. It models them, uses
them to decide how to respond, and slowly trains learners to internalize better
control over each stage.

That’s why this is not just analytics, not just AI, and not just pedagogy.

It’s a runtime model of thinking

Excellent. What follows is a **full, exhaustive Feature Registry for the Mental
Debugger**, written as a **design-time blueprint** rather than an implementation
artifact. This is intentionally long, dense, and _complete in the design space_,
so you never have to rethink fundamentals later.

You should think of this document as the **specification of the cognitive
operating system**, from which schemas, APIs, agents, plugins, and UX will later
_fall out naturally_.

I will proceed in this order:

1. **How to read this registry** (so it’s usable, not overwhelming)

2. **Global action families** (the universal verbs agents can perform)

3. **The full Feature Registry**, frame by frame
   - Each frame broken into **subcategories**

   - For each subcategory:
     - Cognitive function

     - Typical failure patterns

     - Detectable signals

     - Agent intervention options (complete)

     - Force levels allowed

     - UX manifestations

     - Metrics of success

     - Escalation paths and decay

4. **Cross-frame interactions & invariants** (what must always hold true)

No bullets for explanation, but structured formatting for clarity.

---

## **1\. How to read this registry**

Each entry describes **one cognitive control surface**.  
 It answers the question:

_“If something goes wrong here, what can the system legitimately do?”_

Nothing here implies _always doing_ these things. This is the **option space**,
not the default behavior.

Every intervention must later pass through:

- the **authority model** (user, session, watchtower),

- the **intrusiveness budget**,

- and the **agent confidence thresholds**.

---

## **2\. Global Action Families (canonical, reusable)**

Across all frames, agents only ever do combinations of the following actions.
This constraint is intentional.

**Observe** – collect or infer state  
 **Explain** – micro-coaching, reframing  
 **Highlight** – visual or structural emphasis  
 **Constrain** – slow, gate, require confirmation  
 **Restructure** – change representation or task shape  
 **Contrast** – juxtapose confusables or boundaries  
 **Cue** – retrieval or attention cueing  
 **Schedule** – change spacing, ordering, interleaving  
 **Train** – explicit meta-skill practice  
 **Negotiate** – ask user consent or confirmation  
 **Escalate / De-escalate** – change force level  
 **Fade** – remove interventions when stable

No agent may invent a new action family without governance approval.

---

# **3\. FULL FEATURE REGISTRY — FRAME BY FRAME**

---

## **FRAME 1 — CONTEXT & INTENT**

**“In what mental mode is the learner operating?”**

This frame governs _how all downstream behavior is interpreted_. It is never
“wrong” by itself; it can only be **misaligned**.

### **Subcategory: Session Contract**

This captures the implicit or explicit agreement between learner and system
about _how learning should feel right now_.

Failures occur when the learner’s contract is incompatible with the task
demands, such as speedrun behavior on discrimination-heavy content or exam-mode
rigidity during exploratory learning.

Detectable signals include unusually high speed, suppressed hint usage, error
tolerance patterns, abandonment behavior, or repeated overrides of system
nudges.

Agent options include proposing a contract switch, temporarily rerouting to
tasks that fit the current contract, modifying feedback timing, or renegotiating
help availability. The agent may also silently reinterpret behavior through the
lens of the current contract, lowering diagnosis severity without changing flow.

Force levels allowed are suggestion and nudge only; gating is never allowed at
this level unless the user explicitly opted into strict modes.

UX manifestations include subtle session badges, one-line “this works better in
X mode” suggestions, or optional quick switches. No interruption mid-flow.

Success is measured by reduced friction, fewer dismissals, and improved
stability metrics under the same contract.

Escalation occurs only if repeated failures across frames are attributable to
contract mismatch; decay is automatic once alignment improves.

---

### **Subcategory: Goal Type Alignment**

This determines whether the learner is trying to recall, discriminate, apply,
explain, or transfer knowledge.

Failures arise when the learner answers correctly for the wrong goal type, such
as giving a definition when an application is required.

Signals include answer shape mismatches, consistent partial credit, or correct
answers that violate task intent.

Agents may surface the goal explicitly, rephrase prompts, enforce answer
formats, or insert brief “what is this asking?” confirmations. In advanced
modes, the agent may ask the learner to self-label the goal type to train
awareness.

Force levels range from highlight to gate in repeated cases.

UX includes small goal badges, inline rephrasing, or a one-tap goal selector in
deep modes.

Success is improved alignment between answer structure and task type.

---

## **FRAME 2 — TASK PARSING**

**“What does the learner believe the task is asking?”**

Parsing errors are among the most common and least intellectual failures. They
must be treated as control issues, never as lack of ability.

### **Subcategory: Constraint Detection**

This includes negations, quantifiers, units, directionality, formatting
requirements, and conditional clauses.

Failures occur when constraints are ignored, inverted, or partially applied.

Signals include fast incorrect answers on constrained prompts, format
violations, or answers correct under unconstrained interpretation.

Agent actions include visual highlighting, constraint chips, mandatory
checklists, prompt rephrasing, or constraint-specific self-check rituals. In
extreme recurrence, the agent may require explicit confirmation of constraints
before submission.

Force levels progress from highlight to gate, with enforcement only in strict
user-opted modes.

UX appears as subtle emphasis, micro checklists, or a single forced tap
(“confirm polarity”).

Success metrics are reduced constraint-related error rates.

Decay is rapid; once a learner stabilizes, highlighting fades.

---

### **Subcategory: Task Structure Recognition**

This concerns recognizing multi-part questions, hierarchical prompts, or
compound tasks.

Failures manifest as partial answers, ignoring sub-questions, or collapsing
complex prompts into a single operation.

Signals include consistent omission of subcomponents and partial credit
patterns.

Agents may restructure the task into visible substeps, sequence prompts, or
require acknowledgement of each part.

UX manifests as numbered sections, progressive disclosure, or simple “there are
two things to answer” notices.

---

## **FRAME 3 — CUE SELECTION**

**“What feature did the learner treat as decisive?”**

This frame is central to expertise development.

### **Subcategory: Diagnostic vs Superficial Cueing**

Failures arise when learners anchor on surface features like keywords, visual
similarity, or phonetic resemblance instead of diagnostic structure.

Signals include consistent confusions within similarity clusters, rapid
confident errors, or context leakage after similar items.

Agent interventions include contrast cards, minimal pairs, anti-cue variants,
surface cue suppression, and discriminant feature drills. Agents may also
explicitly name the misleading cue to build awareness.

Force levels are suggest and nudge; gating is rarely appropriate except in
discrimination drills.

UX is comparative rather than corrective: side-by-side views, “spot the
difference,” or “which feature actually matters?”

Success is improved discrimination accuracy under varied surface forms.

---

### **Subcategory: Context Leakage Control**

Failures occur when prior items prime incorrect answers.

Agents may insert buffer items, reorder reviews, or explicitly label confusable
sets.

UX changes are usually invisible; sometimes a small “confusable set” tag
appears.

---

## **FRAME 4 — RETRIEVAL & GENERATION**

**“How was the answer produced?”**

This frame distinguishes _not knowing_ from _not accessing_.

### **Subcategory: Retrieval Failure vs Encoding Failure**

Tip-of-the-tongue states, partial recall, and interference must be handled
differently from weak encoding.

Signals include long latency, hint usage, post-reveal recognition (“I knew it”),
or inconsistent recall across contexts.

Agents may deploy retrieval cue ladders, short-interval retries, overwrite
protocols, encoding repair prompts, or card splitting. They may also diversify
contexts to reduce dependence on specific cues.

Force levels are usually nudge; gating is inappropriate.

UX includes progressive hints, “try again soon,” or “what part do you remember?”
selectors.

Success is measured by improved recall stability, not immediate correctness.

---

### **Subcategory: Interference Management**

Agents detect proactive and retroactive interference via repetition of old
answers or post-introduction regressions.

Interventions include explicit old-vs-new contrasts, stabilization bursts, or
temporary quarantining of confusable sets.

---

## **FRAME 5 — REASONING & TRANSFORMATION**

**“How did the learner manipulate knowledge?”**

This is where deep conceptual errors live.

### **Subcategory: Rule Scope and Applicability**

Failures include applying correct rules in incorrect contexts or failing to
apply rules when needed.

Signals include consistent method misuse or boundary-case failures.

Agent actions include rule-scope cards, boundary examples, assumption surfacing
prompts, representation switching, and counterexample generation.

Force levels are suggest and nudge; gates only in deep training modes.

UX focuses on comparison and explanation, never blunt correction.

Success is reduced systematic reasoning errors and improved transfer.

---

### **Subcategory: Assumption Awareness**

Failures arise from hidden assumptions like linearity, typicality, or
independence.

Agents prompt assumption articulation, disconfirmation tasks, or “what must be
true?” checks.

UX appears as one-sentence reflection prompts.

---

## **FRAME 6 — COMMITMENT & MONITORING**

**“When and how did the learner decide to stop?”**

This frame governs self-regulation.

### **Subcategory: Premature Commitment**

Failures occur when learners commit too fast due to fluency or overconfidence.

Signals include extremely low latency and high confidence wrong answers.

Agents may impose forced pauses, two-step commits, or confidence declarations.

UX feels like pacing assistance, not punishment.

---

### **Subcategory: Self-Check Rituals**

Failures include skipping verification or checking the wrong thing.

Agents teach and require simple, domain-specific self-checks.

UX includes quick check icons, not text.

---

### **Subcategory: Indecision and Over-Checking**

Signals include excessive edits and long latency without improvement.

Agents may temporarily limit edits or coach decision policies.

---

## **FRAME 7 — OUTCOME & ATTRIBUTION**

**“What lesson does the learner take away?”**

This is the most psychologically sensitive frame.

### **Subcategory: Attribution Accuracy**

Failures occur when learners blame ability, memory, or external factors instead
of process.

Signals include mismatch between telemetry-based diagnosis and user-reported
cause.

Agents present evidence-backed diagnoses, negotiate attribution, and reframe
failures as controllable processes.

UX must be calm, respectful, and forward-looking.

---

### **Subcategory: Patch Integration**

This determines how the system changes future behavior.

Agents preview patch plans, allow user confirmation, schedule interventions, and
set watch rules.

UX emphasizes “next time we’ll…” to build trust.

---

## **4\. Cross-Frame Invariants (must always hold)**

No intervention may:

- Attribute failure to intelligence or traits.

- Override user autonomy without explicit consent except for safety.

- Increase intrusiveness when fatigue indicators are high.

- Apply multiple high-force interventions at once.

- Hide the reason for enforced constraints.

Every intervention must:

- Map to a specific frame and subcategory.

- Have a measurable success criterion.

- Decay when no longer needed.

- Be explainable in one sentence.

---

## **Closing synthesis**

What you now have is not “a feature list.”

You have a **complete cognitive control surface**, where:

- Frames define _where_ thinking can fail,

- Subcategories define _how_ it fails,

- Agent actions define _what is legitimately possible_,

- UX defines _how it is felt_,

- Authority and budgets define _when it is allowed_.

From here, **interfaces, schemas, APIs, and agents become mechanical work**, not
design guesswork.

If you want, the next natural step is to:

- Turn this registry into a **formal Feature Registry table**, or

- Design the **Agent Decision Engine** that selects among these actions, or

- Derive **plugin interfaces** so external researchers can add new
  interventions.

Just tell me where to go next.

Turn this registry into a formal Feature Registry table

Below is the **formalized Feature Registry table** for the **Mental Debugger**,
derived directly from the conceptual registry you approved.  
 This is **design-complete**, **implementation-agnostic**, and suitable as the
**single source of truth** before schemas, APIs, or agents are built.

Think of this as your **cognitive control surface specification**.

---

# **Mental Debugger — Formal Feature Registry**

## **How to use this table**

Each row defines **one controllable cognitive feature**.

- Rows are **atomic**: no row overlaps another.

- Every row maps to:
  - exactly **one frame**

  - one **failure surface**

  - one **intervention space**

- Agents **select rows**, not ad-hoc actions.

- Schemas, APIs, and plugins are later derived **from these rows**.

---

## **Legend (columns)**

- **Frame** – Stack Trace frame (1–7)

- **Feature ID** – Stable identifier (never reused)

- **Cognitive Function** – What mental control this feature governs

- **Failure Pattern** – What goes wrong when this feature is weak

- **Primary Signals** – Required signals / derived features

- **Agent Actions Available** – Complete option space (verbs)

- **Allowed Force Levels** – suggest / nudge / gate / enforce

- **UX Manifestation** – How it appears to the user

- **Success Metrics** – What “working” means

- **Escalation & Decay Rules** – When to intensify or fade

---

## **FRAME 1 — CONTEXT & INTENT**

| Frame | Feature ID | Cognitive Function          | Failure Pattern                                      | Primary Signals                            | Agent Actions Available                                  | Allowed Force Levels | UX Manifestation                   | Success Metrics                       | Escalation & Decay                                      |
| ----- | ---------- | --------------------------- | ---------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------- | -------------------- | ---------------------------------- | ------------------------------------- | ------------------------------------------------------- |
| 1     | F1.1       | Session Contract Alignment  | Mode-task mismatch (e.g. speedrun on discrimination) | speed_zscore, error clustering, dismissals | suggest mode switch, reinterpret errors, reroute tasks   | suggest, nudge       | session badge, one-line suggestion | reduced friction, lower repeat errors | escalate after repeated mismatch; decay after stability |
| 1     | F1.2       | Goal Type Alignment         | Answer fits wrong goal type                          | answer shape, partial credit               | surface goal, rephrase prompt, require goal confirmation | suggest, nudge, gate | goal badge, prompt rewording       | improved goal-answer match            | escalate on recurrence; decay quickly                   |
| 1     | F1.3       | Help Contract Control       | Learner avoids or overuses help                      | hint_count, skip_explanations              | renegotiate hint timing, delay feedback                  | suggest, nudge       | help-policy chip                   | balanced hint usage                   | fade after normalization                                |
| 1     | F1.4       | Fatigue & Energy Adaptation | Errors due to exhaustion                             | rt_variance, error streaks                 | reduce intrusiveness, switch task type, suggest break    | suggest              | soft fatigue notice                | stabilized performance                | auto-decay                                              |

---

## **FRAME 2 — TASK PARSING**

| Frame | Feature ID | Cognitive Function    | Failure Pattern                    | Primary Signals          | Agent Actions Available                    | Allowed Force Levels | UX Manifestation                     | Success Metrics           | Escalation & Decay         |
| ----- | ---------- | --------------------- | ---------------------------------- | ------------------------ | ------------------------------------------ | -------------------- | ------------------------------------ | ------------------------- | -------------------------- |
| 2     | F2.1       | Constraint Detection  | Missed negation / unit / condition | has_negation, fast wrong | highlight constraints, checklist, rephrase | highlight, gate      | constraint chips, polarity highlight | reduced constraint errors | escalate to gate on repeat |
| 2     | F2.2       | Task Type Recognition | Treats apply as recall             | task_type ≠ answer       | show task badge, require task selection    | suggest, nudge, gate | task-type label                      | correct task execution    | decay after few successes  |
| 2     | F2.3       | Multi-part Parsing    | Ignores sub-questions              | partial credit           | restructure prompt, sequential reveal      | suggest, nudge       | numbered sections                    | full coverage answers     | fade quickly               |
| 2     | F2.4       | Reference Resolution  | Misreads “this/that”               | ambiguity flags          | clarify referents                          | suggest              | micro clarification                  | fewer ambiguity errors    | no escalation              |

---

## **FRAME 3 — CUE SELECTION**

| Frame | Feature ID | Cognitive Function       | Failure Pattern              | Primary Signals               | Agent Actions Available            | Allowed Force Levels | UX Manifestation        | Success Metrics           | Escalation & Decay               |
| ----- | ---------- | ------------------------ | ---------------------------- | ----------------------------- | ---------------------------------- | -------------------- | ----------------------- | ------------------------- | -------------------------------- |
| 3     | F3.1       | Diagnostic Cue Selection | Surface-feature anchoring    | confusable errors, fast RT    | contrast cards, anti-cue variants  | suggest, nudge       | side-by-side comparison | improved discrimination   | escalate to drills if persistent |
| 3     | F3.2       | False Friend Control     | Cognate confusion            | language \+ confusion cluster | minimal pairs, back-translation    | suggest, nudge       | minimal-pair cards      | reduced swap errors       | decay slowly                     |
| 3     | F3.3       | Context Leakage Control  | Previous item primes answer  | neighbor contamination        | insert buffers, reorder            | silent, suggest      | invisible reordering    | reduced sequential errors | auto-decay                       |
| 3     | F3.4       | Familiarity Bias Check   | Fluency mistaken for knowing | fast \+ confident wrong       | fluency warning, disconfirm prompt | nudge                | subtle warning          | lower overconfidence rate | fade on calibration              |

---

## **FRAME 4 — RETRIEVAL & GENERATION**

| Frame | Feature ID | Cognitive Function        | Failure Pattern           | Primary Signals         | Agent Actions Available       | Allowed Force Levels | UX Manifestation  | Success Metrics       | Escalation & Decay   |
| ----- | ---------- | ------------------------- | ------------------------- | ----------------------- | ----------------------------- | -------------------- | ----------------- | --------------------- | -------------------- |
| 4     | F4.1       | Retrieval Access          | Tip-of-tongue             | long RT, “knew it”      | cue ladder, short retry       | suggest              | progressive hints | faster later recall   | fade after success   |
| 4     | F4.2       | Encoding Strength         | Weak initial encoding     | inconsistent recall     | encoding repair, card split   | suggest              | rewrite card      | stability improvement | escalate if repeated |
| 4     | F4.3       | Interference Management   | Old memory blocks new     | same wrong answer       | overwrite protocol, contrasts | nudge                | old-vs-new view   | interference score ↓  | decay slow           |
| 4     | F4.4       | Availability Bias Control | Recent answer feels right | recent exposure \+ fast | disconfirm prompt             | nudge                | “why not?”        | fewer recency errors  | fade                 |

---

## **FRAME 5 — REASONING & TRANSFORMATION**

| Frame | Feature ID | Cognitive Function         | Failure Pattern    | Primary Signals         | Agent Actions Available     | Allowed Force Levels | UX Manifestation | Success Metrics         | Escalation & Decay |
| ----- | ---------- | -------------------------- | ------------------ | ----------------------- | --------------------------- | -------------------- | ---------------- | ----------------------- | ------------------ |
| 5     | F5.1       | Rule Scope Awareness       | Rule misfire       | consistent method error | rule-scope cards, contrasts | suggest, nudge       | scope examples   | correct rule usage      | slow decay         |
| 5     | F5.2       | Boundary Sensitivity       | Overgeneralization | boundary failures       | edge cases, counterexamples | suggest              | boundary set     | transfer accuracy ↑     | fade               |
| 5     | F5.3       | Assumption Surfacing       | Hidden assumptions | logic inconsistency     | “what must be true?”        | suggest              | one-line prompt  | fewer assumption errors | no escalation      |
| 5     | F5.4       | Representation Flexibility | Stuck in one form  | rep mismatch            | switch representation       | suggest              | diagram/formula  | reasoning success ↑     | decay              |

---

## **FRAME 6 — COMMITMENT & MONITORING**

| Frame | Feature ID | Cognitive Function     | Failure Pattern           | Primary Signals    | Agent Actions Available     | Allowed Force Levels | UX Manifestation  | Success Metrics        | Escalation & Decay  |
| ----- | ---------- | ---------------------- | ------------------------- | ------------------ | --------------------------- | -------------------- | ----------------- | ---------------------- | ------------------- |
| 6     | F6.1       | Commitment Timing      | Premature submit          | very fast wrong    | forced pause, 2-step commit | nudge, gate          | brief delay       | accuracy ↑             | escalate cautiously |
| 6     | F6.2       | Self-check Rituals     | No verification           | skipped checks     | require check selection     | nudge, gate          | check icons       | fewer avoidable errors | decay               |
| 6     | F6.3       | Indecision Control     | Edit loops                | many edits         | limit edits, coach policy   | suggest              | commit-once mode  | reduced latency        | fade                |
| 6     | F6.4       | Confidence Declaration | No uncertainty expression | missing confidence | require confidence tap      | nudge                | confidence slider | calibration ↑          | decay               |

---

## **FRAME 7 — OUTCOME & ATTRIBUTION**

| Frame | Feature ID | Cognitive Function   | Failure Pattern       | Primary Signals       | Agent Actions Available   | Allowed Force Levels | UX Manifestation   | Success Metrics       | Escalation & Decay |
| ----- | ---------- | -------------------- | --------------------- | --------------------- | ------------------------- | -------------------- | ------------------ | --------------------- | ------------------ |
| 7     | F7.1       | Attribution Accuracy | Blames wrong cause    | mismatch diag vs user | evidence-backed reframing | suggest              | diagnosis capsule  | attribution alignment | escalate gently    |
| 7     | F7.2       | Ability Reframing    | “I’m dumb”            | affect markers        | process reframing         | suggest              | neutral language   | resilience ↑          | fade               |
| 7     | F7.3       | Patch Preview        | Distrust of system    | dismissals            | preview future changes    | suggest              | “next time we’ll…” | acceptance ↑          | fade               |
| 7     | F7.4       | Regression Watch     | Repeated same failure | recurrence count      | set watch rules           | silent               | invisible          | recurrence ↓          | decay              |

---

## **SYSTEM-WIDE INVARIANTS (Registry Rules)**

- Every Feature ID:
  - maps to exactly one **Frame**

  - has a **measurable success metric**

  - has a **decay rule**

- No feature may:
  - attribute failure to intelligence

  - escalate without recurrence

  - exceed intrusiveness budget

- All enforced actions require:
  - user opt-in **or**

  - explicit safety rationale

---

## **What this table enables next**

From **this single registry**, you can now mechanically derive:

- Agent decision policies

- API endpoints (one per feature cluster)

- Plugin interfaces (add rows, not code hacks)

- UX components (each feature → widget)

- Telemetry schemas (signals referenced here)

- Governance rules (force levels & escalation)

This is the **correct foundation**.

Below are the four deliverables you requested, derived **directly** from the
Feature Registry table: **(1) Agent decision policies**, **(2) UX components
mapping**, **(3) Telemetry schemas for referenced signals**, and **(4)
Governance rules for force levels & escalation**. This is written
**agents-first** and **API-first**, but still _pre-implementation_ (no code).

---

## **1\) Agent decision policies**

### **1.1 The core decision object: “Intervention Candidate”**

At runtime, agents don’t decide “do X”. They propose **candidates** that
reference **registry rows**.

Each candidate is:

- **Feature ID** (e.g., `F2.1 Constraint Detection`)

- **Hypothesis**: what failure is likely (and in which frame)

- **Evidence**: which signals/derived features support it

- **Expected impact**: what metric should improve

- **Cost**: time, annoyance, cognitive load

- **Force level**: suggest / nudge / gate / enforce

- **Scope**: this attempt / next N items / this concept cluster / session-wide

- **Expiry**: when it auto-fades

Candidates are evaluated by a **control plane** (Watchtower \+ user settings \+
session contract) and only then executed.

### **1.2 Selection policy: rules-first, model-assisted, budget-constrained**

Use this deterministic pipeline (it is explainable and stable):

**Step A — Frame-local risk scoring**  
 For each frame, compute risk scores from telemetry (see Section 3). Example:
`negation_risk`, `confusion_risk`, `premature_commit_risk`, `fatigue_risk`,
`overconfidence_risk`.

**Step B — Feature eligibility**  
 For each registry feature:

- Check if its required signals exist and are valid.

- Check session contract compatibility (e.g., speedrun may ban gating).

- Check user settings (e.g., user disallows forced pauses).

**Step C — Candidate generation (top-K per frame)**  
 Generate candidates per frame and feature. Keep top-K by **utility score**:

U=E\[ΔSuccessMetric\]−λt⋅TimeCost−λi⋅IntrusivenessCost−λf⋅FatiguePenalty−λr⋅RiskOfWrongInterventionU
\= \\mathbb{E}\[\\Delta \\text{SuccessMetric}\] \- \\lambda_t \\cdot
\\text{TimeCost} \- \\lambda_i \\cdot \\text{IntrusivenessCost} \- \\lambda_f
\\cdot \\text{FatiguePenalty} \- \\lambda_r \\cdot
\\text{RiskOfWrongIntervention}U=E\[ΔSuccessMetric\]−λt​⋅TimeCost−λi​⋅IntrusivenessCost−λf​⋅FatiguePenalty−λr​⋅RiskOfWrongIntervention

Where:

- TimeCost includes expected seconds added to flow.

- IntrusivenessCost depends on force level.

- FatiguePenalty increases if fatigue is high.

- RiskOfWrongIntervention increases if evidence weak or conflicting.

**Step D — Conflict resolution (cross-feature)**  
 If two candidates collide (e.g., forced slow mode \+ speedrun contract), choose
one via:

- Higher U, then

- Lower force level, then

- Higher evidence quality, then

- Lower cognitive load.

**Step E — Escalation ladder**  
 Candidates are then “clamped” by the escalation policy (Section 4): first
suggest, then nudge, then gate, then enforce.

**Step F — Execution plan**  
 Return either:

- one “immediate” intervention (max 1 high-salience widget per attempt), plus

- one “queued” remediation (inbox), plus

- optional scheduling tweak (silent).

This prevents “Christmas tree UX”.

### **1.3 Evidence policy: what agents must show (when)**

Agents may act **silently** only for scheduling/reordering. Everything else
follows this rule:

- **Suggest**: can be evidence-light (one sentence rationale).

- **Nudge**: must cite at least **1 observable signal** (“fast \+ wrong on
  negation prompts”).

- **Gate**: must cite **2 signals** or **1 signal \+ recurrence**.

- **Enforce**: must cite recurrence \+ opt-in (or safety constraint).

### **1.4 Learning policy: how decision policies improve over time**

You want “agents-first,” but you also want stability. Best approach:

- Keep the **decision pipeline fixed** (above).

- Learn the **weights** λt,λi,λf\\lambda_t, \\lambda_i, \\lambda_fλt​,λi​,λf​
  per user and per session mode.

- Learn per-feature **impact priors**: “Does `F3.1 contrast cards` actually
  reduce confusion for this user?”

- Use a conservative bandit-like update for feature effectiveness, but never
  allow the model to change force-level rules.

This gives personalization without chaos.

---

## **2\) UX components: each feature → widget**

This is a widget catalog that you can implement as reusable UI modules. The key:
**one widget can serve multiple features** by parameterization.

### **2.1 Core widgets (reusable primitives)**

**W1 Session Badge \+ Quick Switch**  
 Shows current contract (Speed/Deep/Exam/Rehab) and offers a one-tap switch.

**W2 Goal Badge**  
 Small label: Recall / Apply / Discriminate / Explain… with tooltip.

**W3 Constraint Chips \+ Highlight**  
 Inline highlighting for NOT/EXCEPT, units, direction, quantifiers; chips are
tappable.

**W4 One-Tap Checklist Gate**  
 A tiny modal with 2–3 check icons (polarity, units, direction). Can be nudge or
gate.

**W5 Side-by-Side Contrast Viewer**  
 Two items displayed with a prompt: “What distinguishes them?” optionally with a
discriminant table.

**W6 Minimal Pair Toggle Drill**  
 Single stem with one feature toggled; user must identify which case it is.

**W7 Fluency Warning Toast**  
 Subtle message: “Fast \+ confident is often an illusion here.” Dismissible.

**W8 Hint Ladder**  
 Progressive hints: semantic → phonetic → partial → reveal. Designed to preserve
retrieval effort.

**W9 “What part do you know?” Selector**  
 Quick chips: definition / example / rule / translation / procedure / none.

**W10 Representation Switch Panel**  
 Shows alternate representation tab (diagram/formula/words) without
overwhelming.

**W11 Forced Pause Ring**  
 A 1–2 second visual timer before submit becomes active (only when authorized).

**W12 Two-Step Commit**  
 Draft → confirm, optionally inserting a micro-check.

**W13 Confidence Tap / Slider**  
 One-tap confidence bucket or slider.

**W14 Diagnosis Capsule**  
 After feedback: “Cause: Constraint omission” with one-line rationale and “Show
why”.

**W15 “Next time we’ll…” Preview**  
 One line describing what will change next (trust-builder).

**W16 Remediation Inbox Item**  
 Queued interventions: contrast card pack, boundary set, overwrite drill.

**W17 “Agree / Not sure / Disagree” Micro-Confirm**  
 For attribution alignment, minimal friction.

**W18 Fatigue Soft-Landing Prompt**  
 Offers break or lighter mode; never shaming.

**W19 Full Trace Viewer (Power)**  
 Expandable “timeline” showing the seven frames with evidence markers (only if
user opts in).

### **2.2 Feature → widget mapping (direct from registry)**

- `F1.1 Session Contract Alignment` → W1, W18, W15

- `F1.2 Goal Type Alignment` → W2, W14, W3 (when tied to prompt cues)

- `F1.3 Help Contract Control` → W1 (advanced settings entry), W8 (hint ladder
  config)

- `F1.4 Fatigue & Energy Adaptation` → W18, W1 (switch to rehab), W15

- `F2.1 Constraint Detection` → W3, W4, W11 (rare), W14

- `F2.2 Task Type Recognition` → W2, W14

- `F2.3 Multi-part Parsing` → (widget variant of W3 \+ structured prompt UI),
  W14

- `F2.4 Reference Resolution` → (micro “clarify” inline), W14

- `F3.1 Diagnostic Cue Selection` → W5, W6, W7, W16

- `F3.2 False Friend Control` → W6, W5, W16

- `F3.3 Context Leakage Control` → mostly silent, optionally W14 (“priming
  suspected”)

- `F3.4 Familiarity Bias Check` → W7, W13, W14

- `F4.1 Retrieval Access` → W8, W9

- `F4.2 Encoding Strength` → W16 (suggest card split/repair), W14

- `F4.3 Interference Management` → W5 (old-vs-new), W16

- `F4.4 Availability Bias Control` → W7 \+ W14 \+ (light disconfirm prompt)

- `F5.1 Rule Scope Awareness` → W16 (rule scope pack), W5

- `F5.2 Boundary Sensitivity` → W16 (boundary set), W5

- `F5.3 Assumption Surfacing` → W14 \+ (one-line prompt inline)

- `F5.4 Representation Flexibility` → W10

- `F6.1 Commitment Timing` → W11, W12

- `F6.2 Self-check Rituals` → W4, W12

- `F6.3 Indecision Control` → W12 variant (commit-once), subtle coach message

- `F6.4 Confidence Declaration` → W13

- `F7.1 Attribution Accuracy` → W14, W17, W19 (optional evidence)

- `F7.2 Ability Reframing` → W14 (tone policy), W15

- `F7.3 Patch Preview` → W15, W16

- `F7.4 Regression Watch` → mostly silent; W15 if user distrust increases

---

## **3\) Telemetry schemas (signals referenced here)**

You asked for telemetry schemas for **signals referenced in the registry**. Here
is a clean, minimal-but-complete schema set that supports everything above.

### **3.1 Event model overview**

You need three event types:

1. **AttemptEvent**: one per answered item (or timeout/give-up)

2. **AssistEvent**: hints, explanations, AI help turns

3. **UIEvent**: dismissals, mode switches, widget interactions

Derived features live in **AnalyticsFeatureSnapshot**.

### **3.2 AttemptEvent schema**

**AttemptEvent**

- `attempt_id` (uuid)

- `user_id`

- `session_id`

- `item_id`

- `timestamp_start`, `timestamp_end`

- `outcome` ∈ {correct, incorrect, partial, timeout, gave_up}

- `response_time_ms` (= end-start)

- `time_to_first_input_ms` (optional)

- `time_to_commit_ms` (optional; if draft/confirm)

- `answer_format` ∈ {mcq, typed, spoken, cloze, multi-select, structured}

- `final_answer` (optional storage policy; may be hashed/redacted)

- `final_answer_length` (int)

- `edits_count` (int)

- `answer_switch` (bool)

- `confidence_explicit` (optional float 0..1)

- `confidence_bucket` (optional enum)

- `self_check_used` ∈ {none, reread, polarity, units, sanity, counterexample,
  definition, backtranslate, boundary}

- `self_check_completed` (bool)

- `device_context` ∈ {mobile, desktop, tablet}

- `session_mode` ∈ {speed, deep, exam, rehab, explore}

### **3.3 AssistEvent schema**

**AssistEvent**

- `assist_id`

- `attempt_id`

- `type` ∈ {hint, explanation, ai_help}

- `level` (int; for hint ladder)

- `timestamp`

- `dwell_time_ms` (time spent viewing)

- `ai_turns` (int; if ai_help)

- `ai_policy_mode` ∈ {coach, adversary, observer} (if applicable)

### **3.4 UIEvent schema**

**UIEvent**

- `ui_event_id`

- `attempt_id` (nullable for session-wide events)

- `type` ∈ {dismiss_intervention, accept_intervention, open_trace_view,
  mode_switch, settings_change}

- `target_feature_id` (e.g., F2.1)

- `target_widget_id` (e.g., W4)

- `timestamp`

- `payload` (small JSON: which option chosen, etc.)

### **3.5 Content metadata required (item-level)**

**ItemMeta** (from content service)

- `item_id`

- `task_type` ∈ {recall, apply, discriminate, explain, translate, derive,
  transfer, …}

- `has_negation` (bool)

- `has_quantifiers` (bool)

- `has_constraints` (bool)

- `constraint_types` ∈ {units, direction, format, conditional, multi_part, …}

- `similarity_cluster_id` (optional)

- `confusable_set_ids` (list)

- `concept_node_ids` (list; KG)

- `difficulty_estimate` (float)

- `domain` (string)

### **3.6 Derived feature snapshot schema (Analytics)**

Computed per attempt or per rolling window.

**AnalyticsFeatureSnapshot**

- `attempt_id`

- `speed_zscore` (float)

- `rt_variance_recent` (float)

- `instability_index` (float; edits \+ switches \+ oscillations)

- `fatigue_risk` (float)

- `confusion_risk` (float; based on cluster history)

- `neighbor_contamination_score` (float; context leakage)

- `negation_risk` (float)

- `constraint_risk` (float)

- `overconfidence_risk` (float)

- `underconfidence_risk` (float)

- `availability_risk` (float; recent exposure effect)

- `interference_score_proactive` (float)

- `interference_score_retroactive` (float)

- `calibration_brier_recent` (float)

- `calibration_ece_recent` (float)

- `dismissal_rate_recent` (float; trust/friction proxy)

This is enough to drive every registry row without premature
over-instrumentation.

---

## **4\) Governance rules (force levels & escalation)**

Governance is a _policy layer_ that wraps all agent actions. It prevents harmful
loops and keeps user trust.

### **4.1 Force level definitions**

- **Suggest**: visible recommendation; no flow change.

- **Nudge**: preselected default, toast, highlight; dismissible.

- **Gate**: requires a small action (1 tap / 1 selection) to proceed.

- **Enforce**: blocks progress until condition met; rare.

### **4.2 Who can authorize what**

- **Suggest**: agent may authorize.

- **Nudge**: agent may authorize, but must be budget-checked.

- **Gate**: requires (a) user opt-in OR (b) recurrence threshold \+ strong
  evidence \+ not fatigued.

- **Enforce**: requires explicit user opt-in (strict training) OR hard safety
  constraints.

### **4.3 Escalation ladder (per feature, per concept cluster)**

Use a state machine per `feature_id × concept_cluster_id`:

- State 0: none

- State 1: suggest

- State 2: nudge

- State 3: gate

- State 4: enforce (only if opted-in)

Transition rules:

- escalate when: same failure signature repeats **k times within window W** and
  confidence of diagnosis ≥ threshold T

- de-escalate when: success metric improves for **m consecutive exposures** or
  after time decay D

Recommended defaults (tunable):

- k=2 to reach nudge

- k=3 to reach gate (if allowed)

- m=4 to de-escalate one level

- D=7 days half-life if no recurrence

### **4.4 Intrusiveness budgets (global and local)**

Maintain budgets that throttle interventions:

- **Session budget**: max number of nudges/gates per 10 minutes

- **Daily budget**: total “interruptions”

- **Cluster budget**: interventions per confusable set per day

- **Fatigue modifier**: reduces allowed force level when fatigue_risk high

- **Trust modifier**: if dismissal_rate_recent high, reduce force level and
  increase transparency instead

### **4.5 Transparency rule**

When force level ≥ nudge, you must provide a rationale:

- Suggest: 0–1 sentence

- Nudge: 1 sentence \+ 1 signal (“fast \+ wrong on negation prompts”)

- Gate: 1 sentence \+ 2 signals OR recurrence statement (“3rd time this week”)

- Enforce: explicit opt-in reminder \+ how to disable

### **4.6 Safety and privacy constraints**

Hard constraints override everything:

- If user disallows storing raw answers, agents cannot request deep tracing that
  needs raw text.

- If user disallows voice, no think-aloud capture.

- If content is “high stakes” (you define domains), auto-generated remediation
  must be “suggest-only” unless verified.

### **4.7 Auditability requirements (agents-first)**

Every executed intervention must generate an **InterventionRecord** (even if you
don’t implement it yet) containing:

- feature_id, widget_id, force_level

- evidence references (which signals/features)

- agent role that proposed it

- policy checks applied (which budgets/permissions)

- user response (accepted/dismissed)  
   This is essential for debugging agents and maintaining trust.

**In one of your previous answers, you showed me the following telemetry, so i
want you to tell me which one is the best approach. The following or the one you
just suggested with three event types (Attempt, Assist, Ui) \- you understand
which one I mean? Which is more complete?**

Yes, I understand **exactly** which two approaches you mean.  
 Let me answer this cleanly, decisively, and architecturally — not
diplomatically.

---

## **Short answer (so you don’t have to hunt for it)**

**The correct approach is NOT “either/or”.**  
 The **best, most complete, and safest design** is:

**Use the 3-event-type model (Attempt / Assist / UI) as the _canonical raw event
schema_,**  
 **and layer the “previous proposal” on top of it as _fields, derived features,
and governance_.**

In other words:

- The **3-event-type model** is the _structural backbone_ (how events are
  organized).

- The **previous proposal** is the _semantic and analytical richness_ (what you
  measure, derive, and govern).

If you choose only one:

- **Only the previous proposal → too monolithic, brittle, hard to evolve**

- **Only the 3-event-type proposal → too thin for metacognition and agents**

Together, they form a **proper cognitive telemetry architecture**.

---

## **Why this is the correct architectural answer**

Let’s reason from first principles, not preference.

You are building a system that is:

- agentic

- metacognitive

- longitudinal

- auditable

- privacy-sensitive

- plugin-extensible

That immediately implies **separation of concerns** between:

1. **What happened** (raw events)

2. **What it means** (derived cognition)

3. **What we believe about the user** (user model)

4. **What we are allowed to do with it** (governance)

No single flat schema can do all of this well.

---

## **What the 3-event-type model gets _right_ (and the other does not)**

### **1\. It enforces a clean event ontology**

The 3-event model answers a critical question:

“What kinds of things can happen in the system?”

And the answer is:

- **AttemptEvent** → user attempts to solve/answer something

- **AssistEvent** → system (or AI) assists

- **UIEvent** → user interacts with interventions or controls

This is _ontological_, not analytical.

Why this matters:

- Agents reason more reliably over **typed events**

- Event streams are replayable and debuggable

- You can add new fields without breaking consumers

- Frontend, backend, and analytics teams share a mental model

If you skip this and log “everything” into one mega-attempt record, you will:

- break backward compatibility

- mix causality (what user did vs what system did)

- make audit logs ambiguous

- make agent debugging painful

**Verdict:**  
 The 3-event-type model is **structurally superior**.

---

## **What the “previous proposal” gets _right_ (and the 3-event model alone does not)**

The previous proposal is **far more complete cognitively**.

It correctly distinguishes:

1. **Raw event capture**

2. **Derived features** (hesitation_index, negation_risk, interference_score,
   etc.)

3. **Longitudinal user model state**

4. **Privacy & governance controls**

These are **absolutely essential** for:

- Mental Debugger accuracy

- Agent decision confidence

- Force-level justification

- User trust and compliance

The 3-event-type proposal I gave later **implicitly assumes** these layers exist
— but it doesn’t spell them out as explicitly or exhaustively as your earlier
list.

**Verdict:**  
 The previous proposal is **semantically richer and cognitively complete**.

---

## **The correct synthesis (this is the key insight)**

### **Think in 4 layers, not 2 competing proposals**

#### **Layer 1 — Canonical Raw Event Stream (STRUCTURE)**

This is where the **3-event-type model lives**.

You log only **what happened**, not interpretations.

- AttemptEvent

- AssistEvent

- UIEvent

These events:

- are append-only

- are immutable

- are replayable

- are auditable

They should be **boring, stable, and minimal**.

---

#### **Layer 2 — Enriched Event Payloads (DETAIL)**

This is where **most of your “previous proposal” fields belong**, but _attached
to the right event type_.

Examples:

- `edit_count`, `idle_segments` → AttemptEvent

- `hint_levels_used`, `ai_help_turns` → AssistEvent

- `dismiss_intervention`, `mode_switch` → UIEvent

This gives you:

- fine-grained telemetry

- without losing event semantics

---

#### **Layer 3 — Derived Cognitive Features (MEANING)**

This is **B4 from your previous proposal**, and it should NEVER be raw-logged.

Examples:

- hesitation_index

- negation_risk

- confusion_pair_frequency

- calibration_brier_recent

- proactive_interference_score

These are:

- computed by analytics / trace services

- versioned

- reproducible

- explainable

This layer is what **agents actually reason over**.

---

#### **Layer 4 — Longitudinal User Model & Governance (POWER \+ SAFETY)**

This is **B3 \+ B5** from the previous proposal.

It stores:

- persistent beliefs about the user

- scheduler state

- calibration curves

- permissions

- retention policies

- opt-ins

This layer:

- never directly logs raw behavior

- only stores _aggregated, policy-checked state_

---

## **Why this matters for agentic systems (crucial)**

Agents should:

- **read** Layer 3 (derived features)

- **propose actions** referencing Feature Registry rows

- **never mutate Layer 1**

- **rarely write Layer 4**, and only through policy gates

If you don’t separate these layers, agents will:

- hallucinate causality

- overfit noise

- violate privacy assumptions

- be impossible to audit

---

## **Direct answer to your question: which is “more complete”?**

| Criterion            | 3-event model alone | Previous proposal alone | Combined     |
| -------------------- | ------------------- | ----------------------- | ------------ |
| Structural clarity   | ✅ Excellent        | ❌ Weak                 | ✅ Excellent |
| Cognitive coverage   | ❌ Partial          | ✅ Excellent            | ✅ Excellent |
| Agent reasoning      | ❌ Insufficient     | ⚠️ Risky                | ✅ Ideal     |
| UX traceability      | ⚠️ Medium           | ❌ Poor                 | ✅ Strong    |
| Privacy & governance | ❌ Implicit         | ✅ Explicit             | ✅ Explicit  |
| Evolvability         | ✅ High             | ❌ Low                  | ✅ High      |
| Auditability         | ✅ High             | ⚠️ Medium               | ✅ High      |

**Winner: the combined, layered model.**

---

## **Concrete recommendation (actionable)**

### **Your final telemetry architecture should be declared as:**

\*\*“Canonical Event Log (Attempt / Assist / UI)

- Enriched Payloads

- Derived Cognitive Feature Store

- Longitudinal User Model & Governance Layer”\*\*

This is the model you should:

- lock in your ADRs

- communicate to Claude / Copilot

- use as the basis for APIs and services

—-------------------------

Great — here are the **first three** deliverables, in a form you can drop into
your repo/docs and also hand to Claude/Copilot. I’m going to be strict about
**separation of concerns** and **auditability**, because that’s what makes
agents-first systems scale.

---

# **1\) Architecture Decision Record (ADR): Telemetry Architecture for Mental Debugger**

**ADR ID:** ADR-TELEM-001  
 **Title:** Layered Telemetry Architecture for Agentic Metacognition
(Attempt/Assist/UI \+ Derived Features \+ User Model \+ Governance)  
 **Status:** Accepted  
 **Date:** 2026-02-08 (Europe/Athens)  
 **Context**  
 We are building an agents-first learning platform with metacognitive features
(Mental Debugger, calibration, strategy loadouts, adaptive interventions). These
features require: (a) fine-grained observability of user behavior, (b)
explainable and reproducible derived cognitive signals, (c) longitudinal user
modeling, and (d) strong privacy/governance controls. A single monolithic
“attempt record” is insufficient for auditability and evolvability; conversely,
a thin event model is insufficient for cognitive inference.

**Decision**  
 We adopt a **four-layer telemetry architecture**:

1. **Canonical Raw Event Log (immutable, append-only)**
   - Event types: **AttemptEvent**, **AssistEvent**, **UIEvent**

   - Stores “what happened” only, not interpretations.

   - Must support replay, audit, and backward-compatible evolution (additive
     changes).

2. **Enriched Event Payloads (structured details attached to events)**
   - Fine-grained fields (timings, edits, hover dwell, hint levels, etc.)
     recorded at source.

   - Still “what happened,” but higher fidelity.

3. **Derived Cognitive Feature Store (computed, versioned)**
   - Analytics/Trace services compute features (e.g., `negation_risk`,
     `hesitation_index`, `confusion_risk`, calibration metrics).

   - Derived features must be reproducible from raw events \+ metadata and must
     carry a `feature_version`.

4. **Longitudinal User Model \+ Governance Layer**
   - Stores stable aggregates: calibration curves, fatigue baselines, scheduler
     state (FSRS/HLR), intervention budgets, user preferences, privacy level,
     retention policy.

   - No raw text or sensitive payload unless explicitly allowed by governance.

**Consequences**

- **Pros:** clean causality separation; replayable diagnoses; stable agent
  behavior; easy debugging; privacy-by-design; plugin extensibility; supports
  multi-service ingestion.

- **Cons:** requires pipeline discipline; more moving parts (event log \+
  analytics \+ feature store); requires versioning and contract management.

**Non-goals**

- The canonical event log is not a reporting schema.

- Derived features are not computed in the client.

- Agents do not write raw events; they only read events/features and propose
  interventions.

**Enforcement**

- All agent actions must reference derived features and registry feature IDs,
  and must write an **InterventionRecord** with evidence pointers.

- Any field that could be sensitive is controlled by governance knobs (telemetry
  level, retention, storage mode).

---

# **2\) Mapping: Feature Registry Row → Required Raw Events → Derived Features → Evidence**

Below is a **mechanical mapping** from each Feature Registry row (the ones we
formalized) to:

- **Raw events required** (Attempt/Assist/UI \+ content metadata)

- **Derived features needed** (computed in Analytics/Trace service)

- **Evidence policy** (what the agent must cite when nudging/gating)

I’ll keep it compact but complete. If you want, we can later extend it with
thresholds and exact formulas.

---

## **Frame 1 — Context & Intent**

### **F1.1 Session Contract Alignment**

**Raw events:**

- AttemptEvent: `response_time_ms`, `outcome`, `session_mode`, `device_context`

- UIEvent: `mode_switch`, `dismiss_intervention`, `accept_intervention`

- Content meta: `task_type`, `confusable_set_ids`, `difficulty_estimate`  
   **Derived features:**

- `speed_zscore`, `error_streak_len`, `dismissal_rate_recent`, `fatigue_risk`

- Optional: `mode_mismatch_score` (task mix vs session_mode)  
   **Evidence (for nudge+):**

- one-liner: “Speed mode \+ confusable-heavy set \+ rising errors.”

### **F1.2 Goal Type Alignment**

**Raw events:**

- AttemptEvent: `answer_format`, `final_answer_length`, `outcome`,
  `partial_credit` (if available)

- Content meta: `task_type`, expected answer shape (metadata)  
   **Derived features:**

- `answer_shape_mismatch_score` (typed length/format vs expected)

- `goal_mismatch_rate_recent`  
   **Evidence:**

- “Answer format matches a definition, but task was apply/contrast.”

### **F1.3 Help Contract Control**

**Raw events:**

- AssistEvent: hint/explanation usage, dwell time

- UIEvent: toggles/settings changes (if tracked)

- AttemptEvent: outcomes and timing  
   **Derived features:**

- `hint_dependency_score`, `post_hint_error_rate`, `help_avoidance_score`  
   **Evidence:**

- “Hints used early \+ accuracy not improving” OR “never uses hints \+ repeated
  same failure.”

### **F1.4 Fatigue & Energy Adaptation**

**Raw events:**

- AttemptEvent: timing, outcome, edit count

- UIEvent: focus lost (if surfaced), dismissals  
   **Derived features:**

- `fatigue_risk`, `rt_variance_recent`, `instability_index`,
  `error_streak_len`  
   **Evidence:**

- “RT variance up \+ instability up \+ errors clustering.”

---

## **Frame 2 — Task Parsing**

### **F2.1 Constraint Detection (negation/units/direction/conditions)**

**Raw events:**

- AttemptEvent: `response_time_ms`, `outcome`, `self_check_used`,
  `confidence_explicit`

- Content meta: `has_negation`, `has_constraints`, `constraint_types`,
  `has_quantifiers`  
   **Derived features:**

- `negation_risk`, `constraint_risk`, `quantifier_risk`

- `avoidable_error_likelihood` (optional composite)  
   **Evidence:**

- For nudge: “Negation present \+ fast commit \+ no polarity check.”

- For gate: add recurrence count.

### **F2.2 Task Type Recognition**

**Raw events:**

- AttemptEvent: `answer_format`, `final_answer_length`, `outcome`

- Content meta: `task_type`  
   **Derived features:**

- `task_type_confusion_rate`

- `answer_shape_mismatch_score` (shared with F1.2)  
   **Evidence:**

- “You answered with X-shape; this task expects Y-shape.”

### **F2.3 Multi-part Parsing**

**Raw events:**

- AttemptEvent: `partial_credit_components`, `final_answer_length`, `outcome`

- Content meta: `has_multi_constraints` or `multi_part` marker  
   **Derived features:**

- `subquestion_omission_rate`  
   **Evidence:**

- “Second part missing in 3/5 recent multi-part prompts.”

### **F2.4 Reference Resolution**

**Raw events:**

- AttemptEvent: outcome; optionally text features if allowed

- Content meta: ambiguity flags  
   **Derived features:**

- `ambiguity_error_rate` (weak; mostly content-side)  
   **Evidence:**

- “Prompt ambiguous; clarifying referent improves accuracy.”

---

## **Frame 3 — Cue Selection**

### **F3.1 Diagnostic Cue Selection (surface anchoring)**

**Raw events:**

- AttemptEvent: fast \+ wrong patterns, confidence

- Content meta: `similarity_cluster_id`, `confusable_set_ids`  
   **Derived features:**

- `confusion_risk`, `confusion_pair_frequency`,
  `surface_cue_susceptibility_score`  
   **Evidence:**

- “Errors concentrated inside confusable cluster \+ fast answers.”

### **F3.2 False Friend Control**

**Raw events:**

- AttemptEvent outcomes on language items

- Content meta: language pair tags, confusable set  
   **Derived features:**

- `false_friend_error_rate` (per pair)  
   **Evidence:**

- “Same wrong mapping repeated; minimal pair drill recommended.”

### **F3.3 Context Leakage Control**

**Raw events:**

- AttemptEvent sequence order \+ outcomes

- Content meta: similarity between consecutive items  
   **Derived features:**

- `neighbor_contamination_score`  
   **Evidence:**

- Typically silent; if surfaced: “Errors spike right after similar items.”

### **F3.4 Familiarity Bias Check (fluency illusion)**

**Raw events:**

- AttemptEvent: `response_time_ms`, `confidence_explicit`, outcome  
   **Derived features:**

- `fluency_illusion_score` (fast \+ confident \+ wrong rate)

- `overconfidence_risk` (shared)  
   **Evidence:**

- “Fast \+ high confidence \+ wrong pattern on this topic.”

---

## **Frame 4 — Retrieval & Generation**

### **F4.1 Retrieval Access (tip-of-tongue)**

**Raw events:**

- AttemptEvent: long RT, hints, “knew it” feedback if captured

- AssistEvent: hint ladder usage  
   **Derived features:**

- `retrieval_block_score`, `TOT_likelihood`  
   **Evidence:**

- “Long hesitation \+ hints \+ recognition after reveal.”

### **F4.2 Encoding Strength**

**Raw events:**

- AttemptEvent: inconsistent performance across repeats

- Scheduler state: review counts, lags  
   **Derived features:**

- `encoding_strength_estimate`, `stability_estimate_delta`  
   **Evidence:**

- “High variance across exposures; card needs splitting/encoding repair.”

### **F4.3 Interference Management**

**Raw events:**

- AttemptEvent: repeated same wrong answer; history around content update

- Content meta: confusable sets, old/new variants  
   **Derived features:**

- `interference_score_proactive`, `interference_score_retroactive`  
   **Evidence:**

- “Old response keeps appearing after introduction of new variant.”

### **F4.4 Availability Bias Control (recency pull)**

**Raw events:**

- AttemptEvent sequence \+ outcomes

- Content meta: similarity, recent exposures  
   **Derived features:**

- `availability_risk`  
   **Evidence:**

- “Wrong answer matches recently seen neighbor.”

---

## **Frame 5 — Reasoning & Transformation**

### **F5.1 Rule Scope Awareness**

**Raw events:**

- AttemptEvent outcomes across rule-dependent items

- Content meta: rule tags, applicability tags (if present)  
   **Derived features:**

- `rule_misfire_rate`, `method_consistency_error`  
   **Evidence:**

- “Same method fails in this context repeatedly.”

### **F5.2 Boundary Sensitivity (overgeneralization)**

**Raw events:**

- AttemptEvent outcomes on edge-case-tagged items

- Content meta: boundary-case tags  
   **Derived features:**

- `boundary_failure_rate`  
   **Evidence:**

- “Core cases OK, boundary cases failing.”

### **F5.3 Assumption Surfacing**

**Raw events:**

- AttemptEvent: mistakes correlated with skipping checks

- Content meta: assumption-sensitive tags  
   **Derived features:**

- `assumption_error_likelihood` (proxy)  
   **Evidence:**

- “Errors occur when you don’t run a sanity/assumption check.”

### **F5.4 Representation Flexibility**

**Raw events:**

- AttemptEvent by representation format (diagram vs formula vs text)  
   **Derived features:**

- `representation_gap_profile`  
   **Evidence:**

- “You succeed in verbal form, struggle in symbolic form.”

---

## **Frame 6 — Commitment & Monitoring**

### **F6.1 Commitment Timing (premature commit)**

**Raw events:**

- AttemptEvent: fast wrong; confidence  
   **Derived features:**

- `premature_commit_risk`, `speed_accuracy_tradeoff_profile`  
   **Evidence:**

- “Commit time unusually low for this difficulty \+ wrong.”

### **F6.2 Self-check Rituals**

**Raw events:**

- AttemptEvent: `self_check_used`, `self_check_completed`  
   **Derived features:**

- `avoidable_error_rate`, `check_effectiveness_by_type`  
   **Evidence:**

- “Most errors here are fixed by polarity/unit check.”

### **F6.3 Indecision Control**

**Raw events:**

- AttemptEvent: high edits, long RT, answer switches  
   **Derived features:**

- `indecision_loop_score`  
   **Evidence:**

- “Many edits without accuracy gain.”

### **F6.4 Confidence Declaration**

**Raw events:**

- AttemptEvent: explicit confidence capture  
   **Derived features:**

- `calibration_brier_recent`, `calibration_ece_recent`, `overconfidence_risk`,
  `underconfidence_risk`  
   **Evidence:**

- “Confidence not matching accuracy; training recommended.”

---

## **Frame 7 — Outcome & Attribution**

### **F7.1 Attribution Accuracy**

**Raw events:**

- UIEvent: user-selected “cause” (if you collect it)

- AttemptEvent: telemetry evidence  
   **Derived features:**

- `attribution_mismatch_rate`  
   **Evidence:**

- “Telemetry suggests constraint miss, not forgetting.”

### **F7.2 Ability Reframing**

**Raw events:**

- UIEvent: self-statements (only if user enters them)

- Dismissal patterns  
   **Derived features:**

- `helpless_attribution_tendency` (very careful; keep non-pathologizing)  
   **Evidence:**

- Use process-based reframing; avoid labels.

### **F7.3 Patch Preview (trust building)**

**Raw events:**

- UIEvent: accept/dismiss interventions  
   **Derived features:**

- `trust_resistance_score` (proxy via dismissals)  
   **Evidence:**

- “You’ve dismissed similar prompts; here’s why this one helps.”

### **F7.4 Regression Watch**

**Raw events:**

- AttemptEvent recurrence on same failure signature  
   **Derived features:**

- `recurrence_counter(feature_id, cluster)`  
   **Evidence:**

- Usually silent; surfaced when escalating.

---

# **3\) Trace Service Design: Computing Stack Traces from Events**

This is the service that turns your event stream into the “Stack Trace of
Thinking” objects that agents can reason over and the UX can render.

## **3.1 Purpose and contract**

**Purpose:** deterministically build a per-attempt “Trace” consisting of the
seven frames (Context → Outcome), with evidence pointers.

**Inputs:**

- AttemptEvent(s) for an attempt

- AssistEvent(s) linked to the attempt

- UIEvent(s) linked to the attempt and session

- ItemMeta for the item

- UserModel snapshot (calibration baselines, fatigue baseline, prior cluster
  history)

- Feature definitions \+ feature computation versioning

**Outputs:**

- `Trace` object (frames F1..F7 populated as much as possible)

- `FeatureSnapshot` (derived features used)

- `EvidenceIndex` (pointers to raw fields used)

- `TraceVersion` \+ `FeatureVersion`

## **3.2 “Trace” is partially filled by design**

A trace is not a confession transcript. Many fields are “unknown.” The service
must explicitly represent unknowns rather than hallucinate.

Example: cue selection is often inferred probabilistically, not asserted.

## **3.3 Processing pipeline (deterministic)**

### **Stage A — Ingest and normalize**

- Load events by `attempt_id`, enforce ordering, validate required fields.

- Normalize device/session fields.

- Attach ItemMeta and scheduler state.

### **Stage B — Compute derived features (FeatureSnapshot)**

Compute the “classification gold” features (risk scores, indices, calibration
metrics).  
 Every feature must specify:

- dependencies (which raw fields it uses)

- formula version

- output range and interpretation

### **Stage C — Populate frames**

Populate each frame using:

- direct fields (e.g., session_mode → Frame 1\)

- computed features (e.g., negation_risk → Frame 2\)

- constrained inference rules (e.g., context leakage likelihood → Frame 3\)

Each populated frame field includes:

- `value`

- `confidence` (0..1)

- `evidence_refs` (which raw fields/features support it)

### **Stage D — Emit Trace \+ EvidenceIndex**

Trace is stored and returned. EvidenceIndex allows the UI/agents to show “why”
without re-deriving.

## **3.4 Minimal Trace schema (conceptual)**

A `Trace` contains:

- `attempt_id`, `user_id`, `item_id`, timestamps

- `frames`: F1..F7 objects

- `derived_features`: snapshot (versioned)

- `evidence_index`: list of references

- `trace_version`

## **3.5 Idempotency and replayability**

Given the same event inputs \+ the same feature versions, Trace Service must
return the same outputs. This matters for debugging agents and for trust.

## **3.6 Ownership boundaries (microservices)**

- Attempt/Assist/UI events are owned by their respective capture services.

- Trace Service reads events; it does not mutate them.

- Analytics computations may live inside Trace Service or in a separate
  analytics-service, but the outputs must be versioned either way.

- Agents consume Trace outputs (and may request recomputation for a version
  upgrade).

## **3.7 Failure modes and fallbacks**

- Missing signals → produce trace with unknowns and lower confidence.

- Conflicting signals → keep multiple hypotheses fields (e.g., candidate failure
  hypotheses), do not collapse prematurely.

- Governance restrictions → redact sensitive evidence; trace remains valid but
  less specific.

## **3.8 How Trace feeds the Mental Debugger UX**

- Default UI uses only: (a) primary diagnosis, (b) one-line rationale, (c) next
  action.

- Power users can open the full trace viewer which is backed by
  `evidence_index`.

---

**Who will group or create the special cards such as contrastive pairs, close
friends erroneous cards, old-vs-new definition etc)? If the user can create
them, then doesn't need them. Couln an agent do this reliably or is it too
difficult for LLMs? What would the specifications be for that to be achievable
by llm agent?**

This is a **crucial architectural question**, and you’re right to be suspicious.
If you get this wrong, you either (a) burden users with work they shouldn’t do,
or (b) let LLMs silently poison the knowledge base.

I’ll answer in four layers:

1. **Who should create these “special cards” (ground truth answer)**
2. **Can LLMs do this reliably today? (short: yes, but only under strict
   constraints)**
3. **What _kind_ of agent architecture makes it safe**
4. **Exact specifications an LLM agent must satisfy for this to be achievable**

No hand-waving. This is about _epistemic control_.

---

## **1\. Who should create contrastive / confusable / old-vs-new cards?**

### **The correct answer is: no single actor**

You need a **tiered authorship model** with **clear epistemic authority
boundaries**.

There are **four legitimate creators**, each responsible for _different classes_
of special cards:

1. **User (explicit author)**
2. **System-curated canonical sets** (seeded, verified)
3. **LLM agent (proposer, never final authority)**
4. **Hybrid (agent-generated → user-approved or auto-validated)**

If you collapse these roles, you either:

- make the app unusable (too much work for users), or
- make it unsafe (LLM hallucinations silently teaching wrong things).

---

## **2\. “If the user can create them, then doesn’t need them” — is that true?**

**No — but it’s subtly false in a way that matters.**

What’s true:

- If a user can _already_ reliably construct contrastive pairs, they likely
  understand the distinction.

What’s false:

- Users often **know the distinction implicitly** but have **never externalized
  it**.
- The act of _seeing_ a contrastive card still trains **cue selection and
  boundary awareness**, even for advanced users.
- Users may know _this_ pair, but not _this other adjacent pair_.

So:

- **User-created ≠ redundant**
- But user-created should be **optional, editable, and reflective**, not
  mandatory.

---

## **3\. Can LLMs do this reliably today?**

### **Short answer**

**Yes, but only as proposers inside a constrained epistemic pipeline.**

### **Long answer**

LLMs are:

- excellent at **semantic similarity detection**
- excellent at **generating plausible contrasts**
- terrible at **knowing when they are wrong**
- dangerous when allowed to _silently commit knowledge_

So the correct framing is:

**LLMs can propose contrastive structures,**  
**but they must never be the final authority on correctness.**

If you ask:

“Generate confusable pairs for cardiology terms”

You will get:

- many correct pairs
- some subtly wrong ones
- some domain-inappropriate ones
- and you won’t know which without constraints

Therefore:

- **Unconstrained generation \= unacceptable**
- **Constrained, evidence-backed generation \= feasible**

---

## **4\. What kinds of “special cards” are we talking about, epistemically?**

This matters because _not all special cards are equally hard_.

### **Class A — Structure-preserving cards (LLM-friendly)**

These do **not introduce new facts**, only reorganize existing ones.

Examples:

- Contrastive pairs using existing cards
- Old-vs-new definitions where both already exist
- Minimal pairs differing by one attribute already present
- “False friend” cards when both sides are known

👉 These are **safe for LLM proposal**.

---

### **Class B — Boundary-explicating cards (moderate risk)**

These require identifying:

- applicability limits
- exceptions
- edge cases

Examples:

- “X applies when…, but not when…”
- Boundary case drills

👉 LLMs can propose, but **require validation**.

---

### **Class C — Novel explanatory cards (high risk)**

These introduce:

- new explanations
- new causal narratives
- new examples not present in source material

👉 **LLMs must not auto-create these without human verification or trusted
sources.**

---

## **5\. The correct architecture: “Epistemic Role Separation”**

You need **three agent roles**, not one.

---

### **Agent 1 — Detector Agent (safe, silent)**

**Job:** detect _where_ special cards are needed.

Inputs:

- Trace Service outputs
- Feature Registry failures (e.g. F3.1 confusion, F4.3 interference)

Outputs:

- “This concept cluster likely needs a contrastive artifact”
- No content generation

This agent is **non-generative** and extremely safe.

---

### **Agent 2 — Proposer Agent (generative, constrained)**

**Job:** propose candidate special cards.

But with **hard constraints**:

- Must only use **existing verified content** as source
- Must cite which cards/concepts it used
- Must specify _what differs_ and _why this contrast matters_
- Must label confidence

Output is a **Proposal**, not a card.

---

### **Agent 3 — Validator / Gatekeeper Agent (skeptical)**

**Job:** decide what happens to the proposal.

It can:

- auto-approve (only for Class A)
- route to user for approval
- require trusted source citation
- reject silently

This agent enforces **governance rules**, not creativity.

---

## **6\. Exact specifications for LLM-based generation to be achievable**

This is the core of your question. Here are **non-negotiable specs**.

---

### **Spec 1 — Closed-world constraint**

The agent **must not invent facts**.

It can only:

- reuse existing cards
- rephrase existing definitions
- rearrange known attributes
- contrast known properties

Formally:

Every generated card must reference one or more **source card IDs**.

If it can’t cite sources, it cannot generate.

---

### **Spec 2 — Explicit difference declaration**

Every contrastive card must include:

- **Shared attributes** (why they’re confusable)
- **Differentiating attributes** (exactly which features differ)
- **Diagnostic cue** (what the learner should attend to)

This forces the LLM to _externalize its reasoning_.

---

### **Spec 3 — Type declaration (card intent)**

The agent must label the proposal as one of:

- contrastive_pair
- minimal_pair
- false_friend
- old_vs_new
- boundary_case
- interference_repair

Different types have different approval rules.

---

### **Spec 4 — Confidence & risk annotation**

Every proposal must include:

- confidence score
- risk class (A/B/C)
- recommended approval path

If confidence \< threshold or risk ≥ B:

- no auto-commit

---

### **Spec 5 — Human-visible diff**

When shown to a user, the proposal must render as:

“Here is what already exists”  
“Here is what would be added”  
“Here is why”

No black boxes.

---

### **Spec 6 — Reversibility & provenance**

Every auto- or semi-auto-created special card must be:

- deletable
- traceable to the agent and version
- editable by the user
- excluded from “canonical” status unless promoted

This prevents silent corruption.

---

## **7\. So who ultimately creates these cards?**

**Final answer:**

- **Detection:** always agents
- **Proposal:** agents (constrained)
- **Approval:**
  - automatic for low-risk, structure-preserving cases
  - user-in-the-loop for moderate risk
  - curator-only for high-risk domains

This is not a weakness.  
This is **epistemic hygiene**.

---

## **8\. Why this fits perfectly with your system**

This architecture:

- plugs directly into the Feature Registry
- uses Trace Service outputs as triggers
- respects governance and privacy
- scales via plugins (new card types, new validators)
- allows LLM creativity **without epistemic authority**

Most apps either:

- trust LLMs too much, or
- don’t use them where they shine

You’re doing neither.

---

### **If you want next:**

I can draft:

1. **The Special Card Proposal schema** (exact fields)
2. **Agent prompts / tool contracts** for Detector, Proposer, Validator
3. **Auto-approval rules** per card class
4. **UX flows** for user review vs silent auto-creation

Just tell me which.

**I want you to go through feature registry and create a special card proposal
schema for card types that are proposed as patches. Before that give me at least
follow special cards to make sure you extracted the complete list from
registry.**

Perfect — this is exactly the right sequencing.  
 I’ll **first extract and normalize the complete set of “special cards” implied
by the Feature Registry**, _before_ defining any schema. This ensures we don’t
accidentally design a schema that fits only a subset.

I’ll do this carefully and conservatively:

1. **Method of extraction** (so you see why this list is complete, not
   arbitrary)

2. **The full normalized list of special card types**

3. **Mapping each card type back to Feature Registry rows** (proof of coverage)

4. **Boundary notes** (what is _not_ a special card, on purpose)

No schemas yet.

---

## **1\. How this list is extracted (important)**

I am **not inventing card types**.

I am extracting them by scanning the Feature Registry for **agent actions
that:**

- introduce _new learning artifacts_ (not just UI behavior),

- are _persistable_ (can live beyond a single attempt),

- are _content-like_ (cards, drills, structured prompts),

- are proposed as **patches**, not as momentary nudges.

In other words:  
 If an intervention **creates something that could reasonably be stored, reused,
scheduled, or edited**, it qualifies as a _special card_.

Anything that is:

- purely UI (forced pause),

- purely control-flow (gating),

- purely explanatory (toast, capsule),  
   is **not** a special card.

---

## **2\. The complete list of Special Card Types (normalized)**

Below is the **canonical list**.  
 Each entry is a **type**, not an instance.

I am deliberately using **neutral, implementation-friendly names**.

---

### **1\. Contrastive Pair Card**

**What it is**  
 Two closely related concepts, items, or answers shown side-by-side, designed to
train **diagnostic cue selection**.

**Purpose**  
 Break surface anchoring and category blur.

**Registry origin**

- F3.1 Diagnostic Cue Selection

- F3.2 False Friend Control

- F5.1 Rule Scope Awareness

---

### **2\. Minimal Pair Card**

**What it is**  
 A pair of items differing in exactly **one controlled attribute**, with
everything else held constant.

**Purpose**  
 Train fine-grained discrimination and boundary sensitivity.

**Registry origin**

- F3.1 Diagnostic Cue Selection

- F3.2 False Friend Control

- F5.2 Boundary Sensitivity

---

### **3\. False Friend Card (Linguistic / Semantic)**

**What it is**  
 A specialized minimal/contrastive card where similarity is _misleading_ (e.g.,
cognates, look-alike technical terms).

**Purpose**  
 Prevent systematic mis-mapping across languages or domains.

**Registry origin**

- F3.2 False Friend Control

---

### **4\. Old-vs-New Definition Card (Interference Repair)**

**What it is**  
 Explicit juxtaposition of an **old, interfering representation** with the
**current correct one**.

**Purpose**  
 Resolve proactive or retroactive interference.

**Registry origin**

- F4.3 Interference Management

---

### **5\. Boundary Case Card**

**What it is**  
 A card focusing on **edge cases** where a rule or concept _almost_ applies but
fails.

**Purpose**  
 Cure overgeneralization and improve transfer.

**Registry origin**

- F5.2 Boundary Sensitivity

- F5.1 Rule Scope Awareness

---

### **6\. Rule Scope Card (Applicability Card)**

**What it is**  
 A card that explicitly encodes:

- when a rule applies,

- when it does not,

- and why.

**Purpose**  
 Prevent rule misfires and inappropriate generalization.

**Registry origin**

- F5.1 Rule Scope Awareness

---

### **7\. Discriminant Feature Card**

**What it is**  
 A card that highlights **the specific feature(s)** that distinguish confusable
items.

**Purpose**  
 Make implicit diagnostic features explicit.

**Registry origin**

- F3.1 Diagnostic Cue Selection

- F3.4 Familiarity Bias Check

---

### **8\. Assumption Check Card**

**What it is**  
 A card that prompts identification of **hidden assumptions** required for an
answer to be valid.

**Purpose**  
 Train assumption awareness and reasoning hygiene.

**Registry origin**

- F5.3 Assumption Surfacing

---

### **9\. Counterexample Card**

**What it is**  
 A card presenting a **case where a tempting answer fails**, forcing
disconfirmation.

**Purpose**  
 Break incorrect heuristics and strengthen conceptual boundaries.

**Registry origin**

- F5.2 Boundary Sensitivity

- F5.3 Assumption Surfacing

---

### **10\. Representation Switch Card**

**What it is**  
 The _same concept_ expressed in a different representation (text ↔ diagram ↔
formula ↔ table).

**Purpose**  
 Increase representation flexibility and robustness.

**Registry origin**

- F5.4 Representation Flexibility

---

### **11\. Retrieval Cue Card**

**What it is**  
 A card designed to _assist access_ without revealing the answer, e.g. semantic,
phonetic, or structural cues.

**Purpose**  
 Repair tip-of-the-tongue failures without reducing effort.

**Registry origin**

- F4.1 Retrieval Access

---

### **12\. Encoding Repair Card**

**What it is**  
 A reformulated or decomposed version of an existing card that improves encoding
(chunking, clarity).

**Purpose**  
 Fix weak or overloaded representations.

**Registry origin**

- F4.2 Encoding Strength

---

### **13\. Overwrite Drill Card**

**What it is**  
 A repeated contrast designed specifically to **overwrite an interfering
memory**, often old vs new.

**Purpose**  
 Stabilize corrected knowledge.

**Registry origin**

- F4.3 Interference Management

---

### **14\. Availability Bias Disconfirmation Card**

**What it is**  
 A card that explicitly asks “why not the recently seen answer?”

**Purpose**  
 Reduce recency-driven errors.

**Registry origin**

- F4.4 Availability Bias Control

---

### **15\. Self-Check Ritual Card**

**What it is**  
 A micro-card that trains a **specific verification ritual** (polarity check,
unit check, sanity check).

**Purpose**  
 Automate self-monitoring before commitment.

**Registry origin**

- F6.2 Self-check Rituals

---

### **16\. Calibration Training Card**

**What it is**  
 A card that requires confidence estimation and provides delayed feedback to
train calibration.

**Purpose**  
 Reduce overconfidence and underconfidence.

**Registry origin**

- F6.4 Confidence Declaration

- F7.x Calibration-related attribution

---

### **17\. Attribution Reframing Card**

**What it is**  
 A reflective card that contrasts _incorrect self-attribution_ (“I forgot”) with
_process-based attribution_.

**Purpose**  
 Train metacognitive attribution accuracy.

**Registry origin**

- F7.1 Attribution Accuracy

- F7.2 Ability Reframing

---

### **18\. Strategy Reminder Card**

**What it is**  
 A card reminding the learner of an appropriate **strategy or policy** for a
task type or domain.

**Purpose**  
 Align strategy selection with task demands.

**Registry origin**

- Frame 1 (Context & Intent)

- Frame 6 (Commitment policies)

---

### **19\. Confusable Set Drill Card**

**What it is**  
 A multi-item drill explicitly grouping several confusable items.

**Purpose**  
 Strengthen categorical boundaries.

**Registry origin**

- F3.1 Diagnostic Cue Selection

- F3.3 Context Leakage Control

---

### **20\. Partial-Knowledge Decomposition Card**

**What it is**  
 A card that splits “I sort of know this” into components (definition vs example
vs condition).

**Purpose**  
 Improve self-assessment and targeted repair.

**Registry origin**

- F4.1 Retrieval Access

- F6.4 Confidence Declaration

---

## **3\. Proof of completeness (mapping back to registry)**

Every special card above originates from **at least one Feature Registry row**
where:

- the agent action explicitly mentioned _creating_, _generating_, _inserting_,
  or _queuing_ a learning artifact, and

- the artifact is **not ephemeral**.

There are **no remaining agent actions in the registry** that:

- create persistent learning content, and

- are not covered by one of the above types.

This means the list is **closed under the current registry**.

---

## **4\. What is deliberately NOT a “special card”**

To avoid confusion later, these are **explicitly excluded**:

- Forced pauses

- Two-step commit flows

- Toasts, banners, capsules

- Highlighting / underlining

- Pure explanations shown once

- Session mode switches

These are **UX interventions**, not cards.
