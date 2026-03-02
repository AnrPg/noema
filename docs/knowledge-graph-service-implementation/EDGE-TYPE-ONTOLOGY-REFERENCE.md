# Edge Type Ontology Reference

## Purpose

This document is the authoritative reference for the 17 epistemological edge
types in Noema's knowledge graph. It serves three audiences:

1. **Developers** implementing graph operations, validation, and metrics
2. **Agents** (AI) that propose CKG mutations and need to select the
   semantically correct edge type
3. **Learners** (users) who build Personal Knowledge Graphs (PKGs) and must
   understand what each relationship means

---

## Ontological Category System

Every edge type belongs to exactly one of 6 **ontological categories**. The
category groups edge types by the kind of relationship they encode:

| Category                   | Key                      | Edge Types                                                 | Core Question                                                       |
| -------------------------- | ------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------- |
| **Taxonomic**              | `taxonomic`              | `is_a`, `exemplifies`                                      | "What kind of thing is A relative to B?"                            |
| **Mereological**           | `mereological`           | `part_of`, `constituted_by`                                | "What is A made of or contained within?"                            |
| **Logical**                | `logical`                | `equivalent_to`, `entails`, `disjoint_with`, `contradicts` | "What is the formal logical relationship between A and B?"          |
| **Causal/Temporal**        | `causal_temporal`        | `causes`, `precedes`, `depends_on`                         | "Does A bring about, come before, or require B?"                    |
| **Associative**            | `associative`            | `related_to`, `analogous_to`, `contrasts_with`             | "How are A and B similar, different, or connected?"                 |
| **Structural/Pedagogical** | `structural_pedagogical` | `prerequisite`, `derived_from`, `has_property`             | "How does A relate to B from a learning or structural perspective?" |

---

## Complete Edge Type Reference

### 1. `is_a` — Taxonomic Subsumption

| Property           | Value                           |
| ------------------ | ------------------------------- |
| **Category**       | Taxonomic                       |
| **Direction**      | A `is_a` B → "A is a kind of B" |
| **Symmetric**      | No                              |
| **Acyclic**        | Yes                             |
| **Source types**   | concept                         |
| **Target types**   | concept                         |
| **Default weight** | 1.0                             |

**Semantics**: Aristotelian genus–species classification. The source inherits
the defining properties of the target as a specialisation. This is the strongest
claim about category membership.

**When to use**:

- `Polynomial IS_A Algebraic_Expression`
- `Binary Search IS_A Search Algorithm`
- `Sonnet IS_A Poetic Form`

**When NOT to use**:

- When A is a _part_ of B (use `part_of`)
- When A is an _instance_ or _example_ of B (use `exemplifies`)
- When A and B are equivalent (use `equivalent_to`)

**Common confusion**: IS*A vs PART_OF. "Derivative IS_A Calculus" is **wrong** —
a derivative is not \_a kind of* calculus; it is a concept _within_ calculus.
Correct: `Derivative PART_OF Calculus`.

**Disambiguation test**: "Every A is a B" should sound correct. "Every
polynomial is an algebraic expression" ✓. "Every derivative is a calculus" ✗.

---

### 2. `exemplifies` — Type-Instance

| Property           | Value                                               |
| ------------------ | --------------------------------------------------- |
| **Category**       | Taxonomic                                           |
| **Direction**      | A `exemplifies` B → "A is an example/instance of B" |
| **Symmetric**      | No                                                  |
| **Acyclic**        | Yes                                                 |
| **Source types**   | example, counterexample                             |
| **Target types**   | concept, principle, fact                            |
| **Default weight** | 1.0                                                 |

**Semantics**: Links a concrete instance (example or counterexample) to the
abstract category it illustrates. The source is a specific case; the target is
the general concept.

**When to use**:

- `"Water freezes at 0°C" EXEMPLIFIES Phase Transition`
- `"Halting Problem" EXEMPLIFIES Undecidability`
- `"Ptolemaic Model" EXEMPLIFIES (counterexample) Scientific Accuracy`

**When NOT to use**:

- When both A and B are abstract concepts (use `is_a`)
- When A doesn't illustrate B but is merely related (use `related_to`)

**Disambiguation test**: "A is a specific case that shows B in action."

---

### 3. `part_of` — Compositional Parthood

| Property           | Value                                        |
| ------------------ | -------------------------------------------- |
| **Category**       | Mereological                                 |
| **Direction**      | A `part_of` B → "A is a component/part of B" |
| **Symmetric**      | No                                           |
| **Acyclic**        | Yes                                          |
| **Source types**   | all                                          |
| **Target types**   | concept, principle                           |
| **Default weight** | 1.0                                          |

**Semantics**: A is structurally contained within B as a component. Implies that
B is a composite structure with A as one of its parts. This creates a
containment hierarchy.

**When to use**:

- `Derivative PART_OF Calculus`
- `Mitosis PART_OF Cell Division`
- `Variables PART_OF Programming`

**When NOT to use**:

- When A is a type/kind of B (use `is_a`)
- When A is _made of_ B without being a structural component (use
  `constituted_by`)
- When A merely depends on B (use `depends_on`)

**Common confusion**: PART*OF vs IS_A. Ask: "Is A a \_component within* B, or is
A _a kind of_ B?" Components compose; types specialize.

**Disambiguation test**: "B has A as one of its parts/topics/components."

---

### 4. `constituted_by` — Material Constitution

| Property           | Value                                               |
| ------------------ | --------------------------------------------------- |
| **Category**       | Mereological                                        |
| **Direction**      | A `constituted_by` B → "A is constituted/made of B" |
| **Symmetric**      | No                                                  |
| **Acyclic**        | Yes                                                 |
| **Source types**   | concept, procedure, principle                       |
| **Target types**   | concept, fact, principle                            |
| **Default weight** | 1.0                                                 |

**Semantics**: Material constitution without identity. A is built from or
realized by B, but A and B are not the same thing — they have different identity
conditions. The classic example: a statue is constituted by clay, but the statue
is not identical to the clay (they have different persistence conditions).

**When to use**:

- `Algorithm CONSTITUTED_BY Data Structures + Control Flow`
- `Scientific Theory CONSTITUTED_BY Hypotheses + Evidence + Models`
- `Musical Harmony CONSTITUTED_BY Intervals + Chords`

**When NOT to use**:

- When A is a structural sub-topic of B (use `part_of`)
- When A is a kind of B (use `is_a`)
- When A merely depends on B (use `depends_on`)

**Disambiguation test**: "A is made of / built from / realized by B, but A is
more than just B."

---

### 5. `equivalent_to` — Logical Equivalence

| Property           | Value                                     |
| ------------------ | ----------------------------------------- |
| **Category**       | Logical                                   |
| **Direction**      | A `equivalent_to` B → "A ≡ B" (symmetric) |
| **Symmetric**      | Yes                                       |
| **Acyclic**        | No                                        |
| **Source types**   | concept, fact, procedure, principle       |
| **Target types**   | concept, fact, procedure, principle       |
| **Default weight** | 1.0                                       |

**Semantics**: Mutual entailment. A and B are co-extensional — they refer to the
same set of things, or they are logically interchangeable in all contexts. This
is a very strong claim.

**When to use**:

- `E = mc² EQUIVALENT_TO Mass-Energy Equivalence`
- `Turing Machine EQUIVALENT_TO Lambda Calculus` (computational equivalence)
- `Rate of Change EQUIVALENT_TO Derivative` (in the continuous case)

**When NOT to use**:

- When A merely resembles B (use `analogous_to`)
- When A implies B but not vice versa (use `entails`)
- When they overlap but aren't identical (use `related_to`)

**Use sparingly**: Most concepts that seem equivalent differ in framing,
context, or extension. Ask: "Are A and B truly interchangeable in _every_
context?"

**Disambiguation test**: "Knowing A means knowing B, and knowing B means knowing
A — they are the same thing expressed differently."

---

### 6. `entails` — Asymmetric Entailment

| Property           | Value                                     |
| ------------------ | ----------------------------------------- |
| **Category**       | Logical                                   |
| **Direction**      | A `entails` B → "A necessarily implies B" |
| **Symmetric**      | No                                        |
| **Acyclic**        | Yes                                       |
| **Source types**   | concept, fact, procedure, principle       |
| **Target types**   | concept, fact, procedure, principle       |
| **Default weight** | 0.9                                       |

**Semantics**: A logically implies B in one direction. Understanding A
guarantees understanding B, but not vice versa. If both directions hold, use
`equivalent_to` instead.

**When to use**:

- `Continuity ENTAILS Limits` (continuity requires limits)
- `Group Theory ENTAILS Set Theory` (group theory implies set theory knowledge)
- `Differentiability ENTAILS Continuity` (differentiable ⊂ continuous)

**When NOT to use**:

- When A is a prerequisite for learning B (use `prerequisite` — that's
  pedagogical, not logical)
- When A causes B (use `causes`)
- When both A→B and B→A hold (use `equivalent_to`)

**Disambiguation test**: "If you fully understand A, you necessarily understand
B — but you can understand B without knowing A."

---

### 7. `disjoint_with` — Mutual Exclusion

| Property           | Value                                     |
| ------------------ | ----------------------------------------- |
| **Category**       | Logical                                   |
| **Direction**      | A `disjoint_with` B → "A ⊥ B" (symmetric) |
| **Symmetric**      | Yes                                       |
| **Acyclic**        | No                                        |
| **Source types**   | concept                                   |
| **Target types**   | concept                                   |
| **Default weight** | 1.0                                       |

**Semantics**: A and B cannot both apply to the same entity. Their extensions
are non-overlapping. This is the strongest possible opposition relationship.

**When to use**:

- `Rational Numbers DISJOINT_WITH Irrational Numbers`
- `Vertebrates DISJOINT_WITH Invertebrates`
- `Deterministic Algorithm DISJOINT_WITH Non-deterministic Algorithm`

**When NOT to use**:

- When A and B are in tension but can coexist (use `contradicts`)
- When A and B are opposites on a scale (use `contrasts_with`)
- When context matters — if the exclusion is domain-specific, prefer
  `contradicts`

**Disambiguation test**: "Can something be both A and B simultaneously? If
absolutely not, use disjoint_with."

---

### 8. `contradicts` — Contradiction/Tension

| Property           | Value                         |
| ------------------ | ----------------------------- |
| **Category**       | Logical                       |
| **Direction**      | A `contradicts` B (symmetric) |
| **Symmetric**      | Yes                           |
| **Acyclic**        | No                            |
| **Source types**   | all                           |
| **Target types**   | all                           |
| **Default weight** | 1.0                           |

**Semantics**: A conflicts with or challenges B. This is weaker than
disjoint_with — contradictions may be context-dependent, resolvable at a higher
level of abstraction, or represent competing perspectives.

**When to use**:

- `Wave Theory of Light CONTRADICTS Particle Theory of Light` (historically)
- `"Premature optimization is evil" CONTRADICTS "Performance matters"`
- `Lamarckism CONTRADICTS Darwinism`

**When NOT to use**:

- When A and B are formally exclusive categories (use `disjoint_with`)
- When A and B are merely different (use `contrasts_with`)
- When A and B are unrelated (use nothing)

**Disambiguation test**: "A and B are in genuine conflict — accepting one casts
doubt on the other."

---

### 9. `causes` — Causal Dependence

| Property           | Value                                       |
| ------------------ | ------------------------------------------- |
| **Category**       | Causal/Temporal                             |
| **Direction**      | A `causes` B → "A produces/gives rise to B" |
| **Symmetric**      | No                                          |
| **Acyclic**        | Yes                                         |
| **Source types**   | all                                         |
| **Target types**   | all                                         |
| **Default weight** | 0.8                                         |

**Semantics**: A is a cause and B is an effect. This is a mechanistic or
explanatory link.

**When to use**:

- `Increased Temperature CAUSES Thermal Expansion`
- `Mutation CAUSES Genetic Variation`
- `Buffer Overflow CAUSES Security Vulnerability`

**When NOT to use**:

- When A merely precedes B in time (use `precedes`)
- When A is needed for B to exist but doesn't "produce" B (use `depends_on`)
- When the causal direction is bidirectional (model as two separate concepts
  with distinct causal links, or reconsider the abstraction)

**Disambiguation test**: "A brings about B — if A happens, B follows."

---

### 10. `precedes` — Temporal/Logical Ordering

| Property           | Value                               |
| ------------------ | ----------------------------------- |
| **Category**       | Causal/Temporal                     |
| **Direction**      | A `precedes` B → "A comes before B" |
| **Symmetric**      | No                                  |
| **Acyclic**        | Yes                                 |
| **Source types**   | concept, fact, procedure, principle |
| **Target types**   | concept, fact, procedure, principle |
| **Default weight** | 0.8                                 |

**Semantics**: Temporal or logical ordering in the domain itself (not in the
learning sequence). "A was developed, discovered, or formulated before B."

**When to use**:

- `Newtonian Mechanics PRECEDES Special Relativity` (historical)
- `Assembly Language PRECEDES High-Level Languages`
- `Classical Logic PRECEDES Non-classical Logic`

**When NOT to use**:

- When A should be learned before B (use `prerequisite`)
- When A causes B (use `causes`)
- When the ordering is purely pedagogical (use `prerequisite`)

**Disambiguation test**: "In the history or logical development of this domain,
A came before B."

---

### 11. `depends_on` — Existential/Generic Dependence

| Property           | Value                                                             |
| ------------------ | ----------------------------------------------------------------- |
| **Category**       | Causal/Temporal                                                   |
| **Direction**      | A `depends_on` B → "A requires B for its existence or definition" |
| **Symmetric**      | No                                                                |
| **Acyclic**        | Yes                                                               |
| **Source types**   | all                                                               |
| **Target types**   | all                                                               |
| **Default weight** | 0.9                                                               |

**Semantics**: A cannot exist, be defined, or function without B. This is an
ontological dependence — B is a necessary condition for A's existence, not just
for learning A.

**When to use**:

- `Color DEPENDS_ON Surface`
- `Velocity DEPENDS_ON Reference Frame`
- `Polymorphism DEPENDS_ON Type System`

**When NOT to use**:

- When A should be learned before B (use `prerequisite`)
- When A logically implies B (use `entails`)
- When A causes B (use `causes` — causation is different from dependence)

**Disambiguation test**: "Can A exist without B? If not, A depends_on B."

---

### 12. `related_to` — Generic Association

| Property           | Value                        |
| ------------------ | ---------------------------- |
| **Category**       | Associative                  |
| **Direction**      | A `related_to` B (symmetric) |
| **Symmetric**      | Yes                          |
| **Acyclic**        | No                           |
| **Source types**   | all                          |
| **Target types**   | all                          |
| **Default weight** | 0.5                          |

**Semantics**: The weakest semantic commitment — A and B are connected in some
way that doesn't fit a more specific edge type. This is the "catch-all"
relation.

**When to use**:

- When no other edge type applies
- As a placeholder when the relationship type is not yet determined
- For loose thematic connections

**When NOT to use**:

- Whenever a more specific edge type applies. `related_to` should be the last
  resort. If you can articulate _how_ A and B are related, pick the edge type
  that matches.

**Edge type escalation**: If a user or agent assigns `related_to`, the system
should suggest more specific alternatives based on node context.

---

### 13. `analogous_to` — Cross-Domain Analogy

| Property           | Value                          |
| ------------------ | ------------------------------ |
| **Category**       | Associative                    |
| **Direction**      | A `analogous_to` B (symmetric) |
| **Symmetric**      | Yes                            |
| **Acyclic**        | No                             |
| **Source types**   | all                            |
| **Target types**   | all                            |
| **Default weight** | 0.6                            |

**Semantics**: A and B share structural or functional resemblance across
different domains or contexts. They are not the same thing, but understanding
one illuminates the other via structural mapping.

**When to use**:

- `Electric Current ANALOGOUS_TO Water Flow`
- `Thermodynamic Entropy ANALOGOUS_TO Information Entropy`
- `Natural Selection ANALOGOUS_TO Market Competition`

**When NOT to use**:

- When A and B are the same concept expressed differently (use `equivalent_to`)
- When A and B are in the same domain (use `related_to` or a more specific edge)
- When the resemblance is superficial (avoid — spurious analogies are a known
  misconception type: `spurious_analogy`)

**Disambiguation test**: "A in domain X is like B in domain Y — they share the
same structure/pattern."

---

### 14. `contrasts_with` — Gradable Opposition

| Property           | Value                            |
| ------------------ | -------------------------------- |
| **Category**       | Associative                      |
| **Direction**      | A `contrasts_with` B (symmetric) |
| **Symmetric**      | Yes                              |
| **Acyclic**        | No                               |
| **Source types**   | all                              |
| **Target types**   | all                              |
| **Default weight** | 0.7                              |

**Semantics**: A and B are best understood in opposition — they are on different
ends of a spectrum or represent complementary alternatives. Weaker than
contradiction; they don't _conflict_, they _illuminate each other through
contrast_.

**When to use**:

- `Acid CONTRASTS_WITH Base`
- `Static Typing CONTRASTS_WITH Dynamic Typing`
- `Centralization CONTRASTS_WITH Decentralization`

**When NOT to use**:

- When A and B genuinely conflict (use `contradicts`)
- When A and B are formally exclusive (use `disjoint_with`)
- When A and B are merely different without a meaningful opposition (use
  `related_to`)

**Disambiguation test**: "A and B are natural opposites or complementary pairs —
understanding one helps define the other."

---

### 15. `prerequisite` — Learning Dependency

| Property           | Value                                                   |
| ------------------ | ------------------------------------------------------- |
| **Category**       | Structural/Pedagogical                                  |
| **Direction**      | A `prerequisite` B → "A requires B to be learned first" |
| **Symmetric**      | No                                                      |
| **Acyclic**        | Yes                                                     |
| **Source types**   | concept, procedure, principle                           |
| **Target types**   | concept, procedure, principle, fact                     |
| **Default weight** | 1.0                                                     |

**Semantics**: A should not be studied until B has been understood. This is a
_pedagogical_ ordering — it describes the optimal learning sequence, not a
logical or temporal one.

**When to use**:

- `Integration PREREQUISITE Differentiation`
- `Recursion PREREQUISITE Functions`
- `Multivariate Calculus PREREQUISITE Single-Variable Calculus`

**When NOT to use**:

- When A logically implies B (use `entails`)
- When A came before B historically (use `precedes`)
- When A depends on B for its definition (use `depends_on`)

**Disambiguation test**: "Should a student learn B before attempting A?"

---

### 16. `derived_from` — Logical/Mathematical Derivation

| Property           | Value                                             |
| ------------------ | ------------------------------------------------- |
| **Category**       | Structural/Pedagogical                            |
| **Direction**      | A `derived_from` B → "A is derived/proven from B" |
| **Symmetric**      | No                                                |
| **Acyclic**        | Yes                                               |
| **Source types**   | concept, procedure, principle                     |
| **Target types**   | all                                               |
| **Default weight** | 1.0                                               |

**Semantics**: A's validity depends on B's — A is logically, mathematically, or
formally derived from B.

**When to use**:

- `Quadratic Formula DERIVED_FROM Completing the Square`
- `Bayes' Theorem DERIVED_FROM Conditional Probability`
- `Kirchhoff's Laws DERIVED_FROM Conservation of Charge + Energy`

**When NOT to use**:

- When B is a prerequisite for learning A (use `prerequisite`)
- When A depends on B existentially (use `depends_on`)
- When A is caused by B (use `causes`)

**Disambiguation test**: "Is there a formal proof or derivation that takes B as
input and produces A?"

---

### 17. `has_property` — Inherence

| Property           | Value                                           |
| ------------------ | ----------------------------------------------- |
| **Category**       | Structural/Pedagogical                          |
| **Direction**      | A `has_property` B → "A has property/quality B" |
| **Symmetric**      | No                                              |
| **Acyclic**        | Yes                                             |
| **Source types**   | concept, procedure, principle                   |
| **Target types**   | concept, fact, principle                        |
| **Default weight** | 0.8                                             |

**Semantics**: A quality, attribute, or characteristic inheres in its bearer. B
is a property that A possesses.

**When to use**:

- `Bubble Sort HAS_PROPERTY O(n²) Time Complexity`
- `Photon HAS_PROPERTY Wave–Particle Duality`
- `Democracy HAS_PROPERTY Majority Rule`

**When NOT to use**:

- When B is a part/component of A (use `part_of`)
- When A is a kind of B (use `is_a`)
- When A depends on B (use `depends_on`)

**Disambiguation test**: "B is an attribute or quality that describes A."

---

## Ontological Conflict Matrix

Some edge type pairs are **incompatible** when applied to the same node pair (A,
B). The system detects these conflicts and, for CKG mutations, escalates them
for human review. For PKG writes, they produce advisory warnings.

### Hard conflicts (always flagged)

| Edge 1          | Edge 2           | Why incompatible                              |
| --------------- | ---------------- | --------------------------------------------- |
| `is_a`          | `part_of`        | A can't be a kind of B and a part of B        |
| `is_a`          | `constituted_by` | A can't be a kind of B and made of B          |
| `equivalent_to` | `is_a`           | If A ≡ B, A is not a subtype of B             |
| `equivalent_to` | `contradicts`    | Can't be equivalent and contradictory         |
| `equivalent_to` | `disjoint_with`  | Can't be equivalent and mutually exclusive    |
| `entails`       | `contradicts`    | A can't imply B and conflict with it          |
| `disjoint_with` | `is_a`           | A can't be excluded from B and be a kind of B |
| `depends_on`    | `disjoint_with`  | A can't need B if they're mutually exclusive  |
| `prerequisite`  | `equivalent_to`  | If A ≡ B, neither is a prereq of the other    |

### Soft conflicts (contextual, require review)

| Edge 1         | Edge 2           | Notes                                     |
| -------------- | ---------------- | ----------------------------------------- |
| `part_of`      | `constituted_by` | Usually distinct but occasionally overlap |
| `causes`       | `contradicts`    | Possible in complex systems but unusual   |
| `entails`      | `equivalent_to`  | May indicate incomplete modelling         |
| `precedes`     | `prerequisite`   | Often correlated but not always identical |
| `analogous_to` | `equivalent_to`  | If truly analogous, likely not equivalent |

---

## Decision Tree: Which Edge Type Should I Use?

```
START: "How are A and B related?"
│
├─ "A is a kind/type/category of B"
│  └─ Is A a specific concrete instance (example)?
│      ├─ Yes → exemplifies
│      └─ No → is_a
│
├─ "A is part of / contained within B"
│  └─ Is A a structural component of B?
│      ├─ Yes → part_of
│      └─ Is A the material/substrate that B is made of?
│          ├─ Yes → constituted_by
│          └─ No → related_to (or reconsider)
│
├─ "A and B are logically related"
│  ├─ "A and B are the same thing" → equivalent_to
│  ├─ "A implies B (one way)" → entails
│  ├─ "A and B can never both be true" → disjoint_with
│  └─ "A and B conflict/tension" → contradicts
│
├─ "A affects or produces B"
│  ├─ "A directly causes B" → causes
│  ├─ "A came before B (chronologically)" → precedes
│  └─ "A needs B to exist" → depends_on
│
├─ "A resembles or contrasts with B"
│  ├─ "A is like B but in a different domain" → analogous_to
│  ├─ "A is the opposite of B" → contrasts_with
│  └─ "A is connected to B somehow" → related_to
│
├─ "A should be learned before/after B" → prerequisite
├─ "A is proven/derived from B" → derived_from
└─ "B is an attribute/property of A" → has_property
```

---

## Worked Examples

### Example 1: Computer Science — Sorting

```
Bubble Sort  IS_A           Sorting Algorithm
Bubble Sort  HAS_PROPERTY   O(n²) Time Complexity
Merge Sort   IS_A           Sorting Algorithm
Merge Sort   HAS_PROPERTY   O(n log n) Time Complexity
Merge Sort   CONTRASTS_WITH Bubble Sort
Sorting      PART_OF        Algorithms
Algorithms   PREREQUISITE   Data Structures
```

### Example 2: Physics — Thermodynamics

```
Entropy              PART_OF          Thermodynamics
Thermodynamic Entropy ANALOGOUS_TO    Information Entropy
Second Law           PART_OF          Thermodynamics
Second Law           ENTAILS          Entropy Increase
Temperature          DEPENDS_ON       Kinetic Energy
Heat Transfer        CAUSES           Temperature Change
Thermodynamics       PREREQUISITE     Classical Mechanics
```

### Example 3: Mathematics — Calculus

```
Differentiation      PART_OF          Calculus
Integration          PART_OF          Calculus
Integration          PREREQUISITE     Differentiation
Fundamental Theorem  DERIVED_FROM     Differentiation + Integration
Continuity           ENTAILS          Limits
Differentiability    ENTAILS          Continuity
L'Hôpital's Rule     DERIVED_FROM     Mean Value Theorem
Newton's Method      CONSTITUTED_BY   Tangent Line Approximation
```

### Example 4: Biology — Evolution

```
Natural Selection    IS_A             Evolutionary Mechanism
Genetic Drift        IS_A             Evolutionary Mechanism
Natural Selection    CONTRASTS_WITH   Genetic Drift
Mutation             CAUSES           Genetic Variation
Genetic Variation    PREREQUISITE     Natural Selection
Lamarckism           CONTRADICTS      Darwinism
Homologous Structures EXEMPLIFIES     Common Ancestry
Convergent Evolution  ANALOGOUS_TO    Parallel Development in Software
```

---

## Relation to External Ontologies

| Noema Edge Type  | SKOS Equivalent   | OWL Equivalent              | ConceptNet Equivalent       |
| ---------------- | ----------------- | --------------------------- | --------------------------- |
| `is_a`           | `skos:broader`    | `rdfs:subClassOf`           | `/r/IsA`                    |
| `exemplifies`    | —                 | `rdf:type`                  | `/r/IsA` (instance)         |
| `part_of`        | —                 | custom `partOf`             | `/r/PartOf`                 |
| `constituted_by` | —                 | custom `constitutedBy`      | `/r/MadeOf`                 |
| `equivalent_to`  | `skos:exactMatch` | `owl:equivalentClass`       | `/r/Synonym`                |
| `entails`        | —                 | `rdfs:subPropertyOf` (weak) | `/r/Entails`                |
| `disjoint_with`  | —                 | `owl:disjointWith`          | `/r/DistinctFrom`           |
| `contradicts`    | —                 | —                           | `/r/NotDesires` (weak)      |
| `causes`         | —                 | —                           | `/r/Causes`                 |
| `precedes`       | —                 | —                           | `/r/HasPrerequisite` (weak) |
| `depends_on`     | —                 | —                           | `/r/HasPrerequisite`        |
| `related_to`     | `skos:related`    | —                           | `/r/RelatedTo`              |
| `analogous_to`   | `skos:closeMatch` | —                           | `/r/SimilarTo`              |
| `contrasts_with` | —                 | —                           | `/r/Antonym`                |
| `prerequisite`   | —                 | —                           | `/r/HasPrerequisite`        |
| `derived_from`   | —                 | —                           | `/r/DerivedFrom`            |
| `has_property`   | —                 | —                           | `/r/HasProperty`            |

---

## Design Rationale

### Why 17 edge types (not fewer or more)?

**Fewer would collapse important distinctions.** The original 8 types forced
users to overload `related_to` for analogy, contrast, dependence, and
property-attribution — all semantically distinct. The misconception detection
engine (`spurious_analogy`, `false_equivalence`, `missing_distinction`) depends
on edge precision.

**More would create decision paralysis.** We considered adding `instantiation`
(separate from `exemplifies`), `overlap` (partial intersection), `complement`
(logical negation), and `necessitates` (modal necessity). These were rejected
because:

- `instantiation` is adequately covered by `exemplifies`
- `overlap` is captured by `related_to` with appropriate weight
- `complement` is covered by `disjoint_with`
- `necessitates` is split between `entails` (logical) and `depends_on`
  (existential)

### Why ontological categories?

Categories serve three purposes:

1. **Pedagogical scaffolding** — teaching users about edge types category-by-
   category
2. **Conflict detection** — certain intra-category conflicts (IS_A + PART_OF)
   need special guardrails
3. **Metric computation** — the `HIERARCHICAL_EDGE_TYPES` set in structural
   metrics uses taxonomic + mereological categories

### Why symmetry metadata?

Symmetric edges (`equivalent_to`, `related_to`, `analogous_to`,
`contrasts_with`, `disjoint_with`, `contradicts`) need different handling:

- Graph storage: only one direction is stored, but traversals check both
- Conflict detection: reverse-pair checks are needed
- UI: displayed as bidirectional arrows
- Agent guidance: symmetric edges shouldn't be proposed in both directions

---

## References

- Guarino, N. (1998). _Formal Ontology in Information Systems_. IOS Press.
- Ganter, B. & Wille, R. (1999). _Formal Concept Analysis_. Springer.
- Speer, R. et al. (2017). "ConceptNet 5.5." AAAI 2017.
- Arp, R., Smith, B. & Spear, A. (2015). _Building Ontologies with BFO_. MIT
  Press.
- Doignon, J.-P. & Falmagne, J.-C. (2011). _Learning Spaces_. Springer.
- W3C. (2009). _SKOS Simple Knowledge Organization System Reference_.
