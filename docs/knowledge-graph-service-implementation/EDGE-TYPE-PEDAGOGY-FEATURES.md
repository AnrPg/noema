# Edge Type Pedagogy — Teaching Features Proposal

> How do we teach learners (and AI agents) to correctly understand, assign, and
> reason about epistemological edge types in their knowledge graphs?

---

## Problem Statement

With 17 edge types organized across 6 ontological categories, users face a
genuine cognitive challenge:

1. **Decision paralysis** — "Which type should I pick?"
2. **Conflation** — confusing `is_a` / `part_of`, `prerequisite` / `depends_on`,
   `contradicts` / `contrasts_with`
3. **Abstraction gaps** — most learners have never explicitly reasoned about
   epistemological relationships
4. **Drift** — even trained users regress to overusing `related_to`

The features below address each failure mode with pedagogical strategies
grounded in the epistemological ontology itself.

---

## Feature 1: Progressive Edge Type Disclosure

### Concept

Don't show all 17 edge types at once. Reveal them in stages tied to the user's
**metacognitive level** and **graph maturity**.

### Stages

| Metacognitive Stage      | Unlocked Types                                         | Rationale                                       |
| ------------------------ | ------------------------------------------------------ | ----------------------------------------------- |
| **Stage 0 — Novice**     | `related_to` only                                      | Let users build a graph without decision burden |
| **Stage 1 — Emerging**   | + `prerequisite`, `part_of`, `is_a`                    | Core structural types; most intuitive           |
| **Stage 2 — Developing** | + `exemplifies`, `causes`, `derived_from`              | Concrete→abstract + causal reasoning            |
| **Stage 3 — Proficient** | + `contradicts`, `contrasts_with`, `analogous_to`      | Comparative/critical thinking                   |
| **Stage 4 — Advanced**   | + `entails`, `depends_on`, `equivalent_to`, `precedes` | Formal logical and temporal reasoning           |
| **Stage 5 — Expert**     | + `disjoint_with`, `constituted_by`, `has_property`    | Full ontological precision                      |

### Promotion Criteria

Promotion from Stage N to N+1 requires:

- **Usage threshold**: created ≥ K edges of the current stage's types
- **Accuracy score**: ≥ 80% of assigned edges pass the ontological conflict
  check (no hard conflicts)
- **Disambiguation quiz score**: passed the stage's micro-quiz (see Feature 4)

### Demotion / Nudge

If a user at Stage 3+ assigns `related_to` more than 50% of the time in a
session, the system should gently prompt: "You used `related_to` for most of
your edges. Would you like to review the edge type picker to find more precise
relationships?"

---

## Feature 2: Contextual Edge Type Picker with Disambiguation

### Concept

When a user draws an edge between two nodes, present a **guided picker** instead
of a raw dropdown. The picker uses contextual cues from the source and target
nodes to suggest and rank edge types.

### UX Flow

```
┌───────────────────────────────────────────┐
│  Link: "Bubble Sort" → "Sorting Algorithm"│
├───────────────────────────────────────────┤
│  💡 Suggested:                            │
│  ● is_a                                   │
│    "Bubble Sort is a kind of Sorting      │
│     Algorithm"                             │
│  ○ part_of                                │
│    "Bubble Sort is a part/component of    │
│     Sorting Algorithm"                     │
│  ○ exemplifies                            │
│    "Bubble Sort is a concrete example of  │
│     Sorting Algorithm"                     │
│                                           │
│  ▸ Show all 17 types                      │
│  ▸ Not sure? Take the 3-question quiz     │
├───────────────────────────────────────────┤
│  ℹ️ Disambiguation:                       │
│  is_a vs exemplifies:                     │
│  "Is Bubble Sort an abstract concept or a │
│   specific concrete instance? If abstract,│
│   use is_a. If it's a worked example or   │
│   specific case, use exemplifies."        │
└───────────────────────────────────────────┘
```

### Suggestion Algorithm

1. **Node type filter**: Remove edge types whose `allowedSourceTypes` /
   `allowedTargetTypes` don't match
2. **Category boost**: If the source/target are in the same domain, boost
   `is_a`, `part_of`, `contrasts_with`. If cross-domain, boost `analogous_to`
3. **Historical pattern**: Check the user's PKG for how similar node-type pairs
   were connected before
4. **Agent recommendation**: The Knowledge Graph Agent can provide a ranked list
   via the `propose_edge_type` tool

### Disambiguation Panel

For the top 2-3 suggestions, show a brief disambiguation sentence generated from
the edge type's `description` field and the node names. E.g.:

> **is_a** → "Every Bubble Sort is a Sorting Algorithm" **part_of** → "Sorting
> Algorithm contains Bubble Sort as a component" **exemplifies** → "Bubble Sort
> is a specific instance of Sorting Algorithm"

The user reads the sentences and picks the one that sounds most correct.

---

## Feature 3: "Ontology Workout" — Spaced Repetition for Edge Type Mastery

### Concept

Edge type understanding is itself a meta-skill that benefits from spaced
repetition. Create a dedicated **Ontology Workout** mode where users practice
classifying relationships.

### Exercise Types

#### Type A: Classification

> "What type of relationship is this?"
>
> `Natural Selection → Evolutionary Mechanism`
>
> - [ ] is_a
> - [ ] part_of
> - [ ] causes
> - [ ] prerequisite
>
> Correct answer: `is_a` — Natural Selection is a kind of Evolutionary
> Mechanism.

#### Type B: Discrimination

> "Both sentences use the same pair of concepts. Which edge type does each
> sentence describe?"
>
> 1. "Continuity requires understanding Limits."
> 2. "Continuity logically implies Limits."
>
> A: (1) `prerequisite`, (2) `entails`
>
> Explanation: (1) describes learning order; (2) describes formal logical
> consequence.

#### Type C: Conflict Detection

> "A student created both of these edges. Is there a conflict?"
>
> - `Rational Numbers IS_A Real Numbers`
> - `Rational Numbers DISJOINT_WITH Real Numbers`
>
> Answer: Yes — a concept can't be a subtype of another and be excluded from it.
> The `disjoint_with` edge is incorrect here.

#### Type D: Edge Upgrade

> "The student used `related_to` for this edge. Can you suggest a more precise
> type?"
>
> `Electric Current RELATED_TO Water Flow`
>
> Better: `analogous_to` — these are analogous concepts from different domains.

### FSRS Integration

Each edge type becomes a "card" in the FSRS scheduler. The user's ability to
correctly assign that edge type is tracked as a memory item with its own
stability and difficulty. Edge types the user struggles with will be reviewed
more frequently.

### Gamification

- **Streak counter**: "You've correctly classified 10 edges in a row!"
- **Category mastery badges**: "You've mastered all Logical edge types 🏅"
- **Weekly edge challenge**: 5 new discrimination exercises per week

---

## Feature 4: Micro-Quizzes for Stage Promotion

### Concept

Each metacognitive stage unlock (Feature 1) requires passing a short quiz that
tests understanding of the newly available edge types.

### Example: Stage 1 → Stage 2 Quiz

**Question 1** (exemplifies):

> "The Halting Problem" is a specific famous result, and "Undecidability" is an
> abstract concept. What edge type connects them?

**Question 2** (causes):

> Increased atmospheric CO₂ leads to greenhouse effect intensification. This is
> a **\_** relationship.

**Question 3** (derived_from):

> The Quadratic Formula can be obtained by applying the method of Completing the
> Square. This is a **\_** relationship.

**Pass threshold**: 2/3 correct → promoted to Stage 2.

---

## Feature 5: Misconception Detection for Edge Type Errors

### Concept

Extend the existing misconception ontology (which covers factual misconceptions
like `spurious_analogy`, `false_equivalence`, `missing_distinction`) to include
**edge type misconceptions**.

### New Misconception Types

| Misconception Type                   | Description                                                        | Detection Strategy                               |
| ------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------ |
| `taxonomy_mereology_conflation`      | Using `is_a` where `part_of` belongs (or vice versa)               | Check "Every A is a B" test via LLM              |
| `prerequisite_entailment_conflation` | Using `prerequisite` where `entails` belongs                       | Check if the ordering is pedagogical or logical  |
| `analogy_equivalence_conflation`     | Using `analogous_to` where `equivalent_to` belongs (or vice versa) | Check if A and B are in the same domain          |
| `contrast_contradiction_conflation`  | Using `contrasts_with` where `contradicts` belongs                 | Check if A and B can coexist                     |
| `property_parthood_conflation`       | Using `has_property` where `part_of` belongs                       | Check if B is an inherent quality or a component |
| `edge_type_laziness`                 | Overusing `related_to` when more specific types are available      | Track `related_to` ratio per user session        |
| `reverse_direction_error`            | Correct edge type but wrong direction                              | Check "A [verb] B" readability test              |

### Remediation Strategy

When a misconception is detected:

1. **Flag the edge** with a subtle indicator (not an error — a learning
   opportunity)
2. **Show a disambiguation micro-lesson**: "You used `is_a` for 'Derivative →
   Calculus'. But a Derivative is not _a kind of_ Calculus — it's a _component
   within_ Calculus. Would you like to change this to `part_of`?"
3. **Track the misconception** in the user's PKG for spaced review
4. **Adjust difficulty** of future Ontology Workout exercises

---

## Feature 6: Agent-Guided Edge Type Tutorial (Socratic Approach)

### Concept

The Socratic Tutor Agent can conduct an interactive edge type teaching session
using the Socratic method — asking questions rather than lecturing.

### Tutorial Flow

```
Agent: "Let's learn about how concepts relate to each other.
        Consider these two concepts: 'Photosynthesis' and 'Biology'.
        How would you describe their relationship?"

User:  "Photosynthesis is part of biology."

Agent: "Good intuition! Now let me ask: is 'Photosynthesis' a *component*
        within Biology (like a chapter in a book), or is it a *kind* of
        Biology (like marine biology is a kind of biology)?"

User:  "It's a component — it's a topic within the field."

Agent: "Exactly! That's a `part_of` relationship. Now here's a trickier
        one: 'Photosynthesis' and 'Cellular Respiration'. Are they
        opposites? Do they conflict? Or are they analogous?"

User:  "They're kind of opposites — one builds glucose, the other breaks
        it down."

Agent: "Great comparison. In our system, we call that `contrasts_with`
        — they're complementary processes best understood in opposition.
        Note: they don't *contradict* each other (both are true!) — they
        contrast. Can you think of two concepts that actually contradict?"

User:  "Spontaneous generation and biogenesis?"

Agent: "Perfect. Spontaneous generation CONTRADICTS biogenesis — accepting
        one means rejecting the other. You've just learned the difference
        between `contrasts_with` and `contradicts`!"
```

### Implementation

- Reuse the Socratic Tutor Agent's existing dialogue framework
- Add edge type teaching as a **session type** in the session service
- Track which categories/types the user has been tutored on
- Integrate with the stage promotion system (Feature 1)

---

## Feature 7: Visual Ontology Map

### Concept

Provide an interactive visual reference that users can access at any time — a
map of the ontology itself.

### Design

```
        ┌──────────────────────────────────┐
        │         ONTOLOGY MAP             │
        │                                  │
        │  ┌─────────┐    ┌────────────┐   │
        │  │Taxonomic │    │Mereological│   │
        │  │ • is_a   │    │ • part_of  │   │
        │  │ • exempl.│    │ • const_by │   │
        │  └─────────┘    └────────────┘   │
        │       │                │          │
        │  ┌─────────┐    ┌────────────┐   │
        │  │ Logical  │    │  Causal /  │   │
        │  │• equiv.  │    │ Temporal   │   │
        │  │• entails │    │ • causes   │   │
        │  │• disjoint│    │ • precedes │   │
        │  │• contrad.│    │ • dep. on  │   │
        │  └─────────┘    └────────────┘   │
        │       │                │          │
        │  ┌─────────┐    ┌────────────┐   │
        │  │Associat. │    │ Structural │   │
        │  │• related │    │ / Pedagog. │   │
        │  │• analog. │    │ • prereq.  │   │
        │  │• contrast│    │ • derived  │   │
        │  └─────────┘    │ • has_prop │   │
        │                  └────────────┘   │
        │                                  │
        │  Tap any type for examples +     │
        │  disambiguation guidance         │
        └──────────────────────────────────┘
```

### Interactions

- **Tap a category** → expand to show its edge types with one-line descriptions
- **Tap an edge type** → show full description, examples, and the "When to use /
  When NOT to use" guidance from the ontology reference
- **Tap "Compare"** → select two edge types and see their disambiguation test
  side by side
- **Long-press** → see which of the user's own edges use this type

---

## Feature 8: Edge Type Analytics Dashboard

### Concept

Show users (and educators) statistics about edge type usage patterns to identify
areas for improvement.

### Metrics

| Metric                | Description                                        | Purpose                           |
| --------------------- | -------------------------------------------------- | --------------------------------- |
| **Type distribution** | Pie chart of edge types in user's PKG              | Detect overuse of `related_to`    |
| **Category coverage** | Which ontological categories are represented       | Identify missing reasoning skills |
| **Conflict rate**     | % of edges flagged for ontological conflicts       | Track reasoning maturity          |
| **Precision score**   | % of `related_to` edges that were later upgraded   | Reward specificity                |
| **Stage progress**    | Current metacognitive stage + progress toward next | Motivate advancement              |
| **Workout accuracy**  | Rolling accuracy in Ontology Workout exercises     | Track meta-skill mastery          |

### Educator View

For instructor-led scenarios, aggregate these metrics across a cohort to
identify common edge type misconceptions in a class.

---

## Feature 9: Agent-Assisted Edge Refinement

### Concept

Periodically, the Knowledge Graph Agent scans the user's PKG for edges that
could be more precise and offers upgrade suggestions.

### Algorithm

1. Find all `related_to` edges
2. For each, examine source/target node types, names, and surrounding graph
   structure
3. Use LLM to classify the likely best edge type
4. Present as a batch suggestion: "I found 7 edges that could be more specific.
   Would you like to review them?"

### UX

```
┌───────────────────────────────────────────┐
│  📋 Edge Refinement Suggestions           │
│                                           │
│  1. "Electric Current → Water Flow"       │
│     related_to → analogous_to             │
│     "These are from different domains     │
│      and share structural similarity"     │
│     [Accept] [Dismiss] [Discuss]          │
│                                           │
│  2. "Recursion → Functions"               │
│     related_to → prerequisite             │
│     "Functions should be learned before   │
│      recursion"                           │
│     [Accept] [Dismiss] [Discuss]          │
│                                           │
│  Accepted: 0/7  Dismissed: 0/7           │
└───────────────────────────────────────────┘
```

"Discuss" opens a Socratic dialogue about why that edge type was suggested.

---

## Feature 10: Onboarding Flow — "Your First Knowledge Graph"

### Concept

A guided first-run experience that teaches edge types by having the user build a
small graph about a topic they already know well.

### Flow

1. **Choose a topic**: "Pick something you know well — a hobby, a subject you
   aced, or your job."
2. **Add 5 concepts**: The user lists 5 concepts within that topic.
3. **Guided linking**: For each pair where a link makes sense, the system walks
   the user through the decision tree (Feature 2) to pick the right edge type.
4. **Review**: Show the completed mini-graph with edge types color-coded by
   category.
5. **Reflection**: "You just used 4 different types of relationships! Here's
   what each one means..." (brief summary).

### Outcome

The user finishes onboarding with:

- A small but correctly-typed graph
- Exposure to 4-5 edge types in context
- A foundation for the progressive disclosure system (Feature 1)

---

## Implementation Priority

| Priority | Feature                        | Effort | Impact | Dependencies                  |
| -------- | ------------------------------ | ------ | ------ | ----------------------------- |
| **P0**   | Progressive disclosure (F1)    | Medium | High   | Metacognitive stage data      |
| **P0**   | Edge type picker (F2)          | Medium | High   | Edge type descriptions (done) |
| **P1**   | Onboarding flow (F10)          | Medium | High   | F2                            |
| **P1**   | Misconception detection (F5)   | High   | High   | Misconception ontology        |
| **P1**   | Agent-assisted refinement (F9) | Medium | High   | KG Agent tooling              |
| **P2**   | Ontology Workout (F3)          | High   | Medium | FSRS scheduler                |
| **P2**   | Micro-quizzes (F4)             | Low    | Medium | F1, F3                        |
| **P2**   | Socratic tutorial (F6)         | Medium | Medium | Socratic Agent                |
| **P3**   | Visual ontology map (F7)       | Medium | Medium | Mobile/web UI                 |
| **P3**   | Analytics dashboard (F8)       | Medium | Low    | Analytics service             |

---

## Summary

These 10 features form a coherent **meta-learning system** that teaches users to
think ontologically about knowledge — which is itself a higher-order cognitive
skill. The system uses:

- **Progressive disclosure** to avoid overwhelm
- **Contextual guidance** to support in-the-moment decisions
- **Spaced repetition** to reinforce edge type mastery over time
- **Socratic dialogue** to develop genuine understanding
- **Misconception detection** to catch and correct errors
- **Gamification** to motivate engagement

The edge types aren't just a technical feature — they're a pedagogical tool for
developing epistemological reasoning.
