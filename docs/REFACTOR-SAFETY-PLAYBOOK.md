# Refactor Safety & Recovery Playbook

> **Structural refactoring without fear: Guidelines for safely splitting, merging, and moving categories while preserving learning continuity.**

## Table of Contents

1. [Philosophy](#philosophy)
2. [Pre-Refactor Checklist](#pre-refactor-checklist)
3. [Operation-Specific Guidance](#operation-specific-guidance)
   - [Splitting Categories](#splitting-categories)
   - [Merging Categories](#merging-categories)
   - [Moving Categories](#moving-categories)
4. [Conflict Resolution](#conflict-resolution)
5. [Recovery Procedures](#recovery-procedures)
6. [Timeline & Snapshot Management](#timeline--snapshot-management)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)

---

## Philosophy

Structural refactoring in Manthanein is designed around a core principle:

> **Knowledge organization should evolve with understanding, not constrain it.**

As you learn, your mental model of a subject naturally evolves. Categories that once seemed unified may need splitting as you recognize distinct sub-concepts. Separate categories may reveal themselves as aspects of a unified whole. The hierarchy itself may need restructuring as relationships become clearer.

### The Safety Guarantees

Every structural operation in Manthanein provides these guarantees:

1. **No Data Loss**: Cards, review history, and learning progress are never deleted during refactoring
2. **Reversibility**: Every operation can be rolled back via snapshots
3. **Audit Trail**: Complete timeline of structural changes with reasoning
4. **Continuity**: FSRS scheduling state is preserved across structural changes
5. **Atomic Operations**: Refactoring either completes fully or rolls back entirely

---

## Pre-Refactor Checklist

Before initiating any structural refactoring operation:

### 1. Assess the Scope

```
Questions to ask yourself:
□ How many cards will be affected?
□ Are any cards currently due for review?
□ Is the affected category part of an active study session?
□ Will this change affect shared decks or collaborative learning?
```

### 2. Verify Sync Status

Ensure all devices are synchronized before refactoring:

```
□ Check last sync timestamp
□ Resolve any pending conflicts
□ Wait for in-progress syncs to complete
```

### 3. Consider Timing

**Good times to refactor:**

- After completing a study session
- During planned "organization" time
- When no reviews are immediately due

**Avoid refactoring when:**

- Mid-study session
- With many cards overdue
- During initial learning of new material

### 4. Review Auto-Snapshot Status

The system automatically creates snapshots:

- Before any structural operation
- Daily (if structural changes occurred)
- Before bulk imports

Verify a recent snapshot exists or create one manually.

---

## Operation-Specific Guidance

### Splitting Categories

**Use Case**: A category has grown to encompass multiple distinct concepts that would benefit from separate tracking.

#### When to Split

✅ **Good reasons to split:**

- Cards naturally group into distinct sub-topics
- You find yourself mentally sorting cards during review
- Study efficiency would improve with more granular categories
- AI suggestions indicate conceptual clustering

❌ **Avoid splitting when:**

- The category is small (< 20 cards)
- Cards are genuinely interrelated
- You're splitting for organizational aesthetics rather than learning benefit

#### The Split Process

```
Step 1: Define Children
├── Name each new subcategory
├── Assign emoji and color for visual distinction
├── Write brief descriptions for cognitive anchoring
└── Define what makes each category distinct

Step 2: Assign Cards
├── Use AI suggestions as starting point
├── Review edge cases manually
├── Ensure no cards are orphaned
└── Verify assignments match your mental model

Step 3: Establish Distinctions
├── Define boundaries between siblings
├── Create "when in doubt" rules
└── Document the conceptual difference

Step 4: Review & Execute
├── Verify card counts
├── Check inheritance of settings
└── Confirm snapshot created
└── Execute split
```

#### Split Strategies

**Conceptual Split**: Based on subject matter

```
"Programming Concepts" →
  ├── "Data Structures"
  ├── "Algorithms"
  └── "Design Patterns"
```

**Difficulty Split**: Based on mastery level

```
"Spanish Vocabulary" →
  ├── "Core (A1-A2)"
  ├── "Intermediate (B1-B2)"
  └── "Advanced (C1-C2)"
```

**Temporal Split**: Based on when learned

```
"Course Notes" →
  ├── "Semester 1"
  ├── "Semester 2"
  └── "Semester 3"
```

#### Post-Split Verification

After splitting, verify:

- [ ] All cards accounted for (no orphans)
- [ ] Review schedules preserved
- [ ] FSRS parameters inherited correctly
- [ ] Navigation works as expected
- [ ] Statistics display properly

---

### Merging Categories

**Use Case**: Separate categories are better understood as aspects of a unified concept.

#### When to Merge

✅ **Good reasons to merge:**

- Categories have significant card overlap in concept
- The distinction between them has become artificial
- Reviewing them together improves contextual learning
- Simplifying hierarchy aids navigation

❌ **Avoid merging when:**

- Categories serve different learning goals
- The merge would create an unwieldy category (> 500 cards)
- Categories have incompatible FSRS parameters

#### The Merge Process

```
Step 1: Select Sources
├── Choose 2+ categories to merge
├── Designate primary category (influences defaults)
└── Review total card count

Step 2: Configure Target
├── Choose name (new or from source)
├── Select emoji and color
├── Decide parent location
└── Set description

Step 3: Handle Conflicts
├── Duplicate cards: Keep newest / Keep all / Manual review
├── Conflicting tags: Union / Intersection / Manual
├── FSRS parameters: Average / Use primary / Custom
└── Descriptions: Concatenate / Use primary / Custom

Step 4: Review & Execute
├── Preview merged structure
├── Verify conflict resolutions
├── Confirm snapshot created
└── Execute merge
```

#### Conflict Resolution Strategies

**Duplicate Cards**

When the same card exists in multiple source categories:

| Strategy             | When to Use                            |
| -------------------- | -------------------------------------- |
| Keep Newest          | Cards were duplicated accidentally     |
| Keep All (with tags) | Duplicates have different context      |
| Manual Review        | Duplicates need case-by-case decisions |

**FSRS Parameters**

When source categories have different FSRS tuning:

| Strategy    | When to Use                                 |
| ----------- | ------------------------------------------- |
| Use Primary | One category has well-tuned parameters      |
| Average     | Both categories have similar review history |
| Reset       | Starting fresh makes more sense             |

#### Post-Merge Verification

After merging, verify:

- [ ] Card count matches expected total
- [ ] No unintended duplicates created
- [ ] Tags properly combined
- [ ] Review schedules preserved
- [ ] Original categories archived (not deleted)

---

### Moving Categories

**Use Case**: A category belongs in a different part of the hierarchy.

#### When to Move

✅ **Good reasons to move:**

- Better parent relationship identified
- Restructuring knowledge hierarchy
- Consolidating related categories
- Fixing initial organization mistakes

❌ **Avoid moving when:**

- Move would create circular references
- Deep nesting would hurt navigation (> 5 levels)
- Move is purely cosmetic

#### The Move Process

```
Step 1: Select Category
├── Choose category to move
├── Review child categories (they move too)
└── Note current path

Step 2: Choose Destination
├── Browse tree or search
├── Select new parent (or root)
├── Review sibling categories
└── Verify no circular reference

Step 3: Preview Impact
├── See new path
├── Verify children move correctly
├── Check for naming conflicts
└── Review access permissions

Step 4: Execute
├── Confirm snapshot created
├── Execute move
└── Verify navigation
```

#### Move Considerations

**Depth Impact**

```
Moving "Advanced Topics" from:
  Root → "Programming" → "Advanced Topics"

To:
  Root → "Computer Science" → "Programming" → "Theory" → "Advanced Topics"

Consider: Is 5 levels of depth navigable?
```

**Sibling Context**

```
Moving "React" to sit alongside:
  ├── "Vue"
  ├── "Angular"
  └── "Svelte"

vs. under "JavaScript" with:
  ├── "Fundamentals"
  ├── "ES6+"
  └── "React"

Which grouping aids learning?
```

#### Post-Move Verification

After moving, verify:

- [ ] Category appears in correct location
- [ ] Children moved with parent
- [ ] Breadcrumb navigation works
- [ ] No broken references
- [ ] Statistics roll up correctly

---

## Conflict Resolution

### Types of Conflicts

#### 1. Card Ownership Conflicts

**Scenario**: During merge, the same card (by content hash) exists in multiple sources.

**Resolution Options**:

```yaml
keep_newest:
  description: "Keep the version with most recent modification"
  use_when: "Duplicates were accidental"

keep_primary:
  description: "Keep version from primary source category"
  use_when: "Primary has authoritative content"

keep_all:
  description: "Keep all versions, tag with source"
  use_when: "Context differs between sources"

manual:
  description: "Present each conflict for manual resolution"
  use_when: "Need case-by-case decisions"
```

#### 2. Parameter Conflicts

**Scenario**: Categories have different FSRS parameters, study settings, or retention targets.

**Resolution Matrix**:

| Parameter        | Merge Strategy Options          |
| ---------------- | ------------------------------- |
| Retention Target | Average / Max / Min / Primary   |
| FSRS Weights     | Average / Primary / Reset       |
| New Card Limit   | Max / Min / Sum / Primary       |
| Review Limit     | Max / Min / Sum / Primary       |
| Card Order       | Primary / Alphabetical / Random |

#### 3. Hierarchy Conflicts

**Scenario**: Move would create invalid structure.

**Detection**:

```
Circular reference: A → B → C → A (prevented)
Orphaned children: Parent deleted, children homeless (auto-reassigned)
Depth exceeded: Nesting > max_depth (warning issued)
```

#### 4. Naming Conflicts

**Scenario**: Target location already has category with same name.

**Resolution**:

```yaml
rename:
  action: "Append suffix: 'Category (merged)'"

replace:
  action: "Replace existing (with confirmation)"
  caution: "Existing category archived first"

cancel:
  action: "Abort operation, rename manually first"
```

---

## Recovery Procedures

### Understanding Snapshots

Snapshots capture the complete structural state:

```typescript
interface StructuralSnapshot {
  id: string;
  createdAt: Date;
  trigger: "auto" | "manual" | "pre-operation";
  description?: string;

  // Full state capture
  categories: CategorySnapshot[];
  cardAssignments: Map<CardId, CategoryId>;
  hierarchyTree: TreeSnapshot;
  fsrsParameters: Map<CategoryId, FSRSParams>;

  // Metadata
  totalCards: number;
  totalCategories: number;
  maxDepth: number;
}
```

### Snapshot Lifecycle

```
┌─────────────────────────────────────────────────────────┐
│                    Snapshot Timeline                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [Auto-Daily]  [Pre-Split]  [Manual]  [Pre-Merge]      │
│       │             │          │           │            │
│       ▼             ▼          ▼           ▼            │
│    Day 1         Day 3      Day 5       Day 7          │
│                                                         │
│  Retention Policy:                                      │
│  • Pre-operation: 30 days                              │
│  • Manual: 90 days                                      │
│  • Auto-daily: 14 days                                 │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Rollback Procedure

#### Step 1: Identify Target Snapshot

```
1. Open Structural Timeline
2. Find the snapshot from BEFORE the problematic operation
3. Note the snapshot ID and timestamp
4. Review the differences (current vs. snapshot)
```

#### Step 2: Preview Rollback Impact

Before rolling back, understand what will change:

```
Rollback Preview:
├── Categories to restore: 3
├── Categories to remove: 2 (created after snapshot)
├── Cards to reassign: 47
├── Settings to revert: FSRS params for 5 categories
└── Data preserved: All cards, all review history
```

#### Step 3: Execute Rollback

```
1. Confirm you've reviewed the preview
2. Optionally create a "current state" snapshot first
3. Execute rollback
4. Verify structure matches expectations
```

#### Step 4: Post-Rollback Verification

- [ ] Category structure restored
- [ ] Cards in correct categories
- [ ] Review schedules intact
- [ ] Navigation working
- [ ] No orphaned cards

### Partial Recovery

Sometimes you don't want full rollback, just selective restoration:

#### Restore Single Category

```
1. Compare snapshots to identify the category state
2. Manually recreate if simple
3. Or use API: POST /api/v1/refactor/restore-category
   {
     "snapshotId": "snap_xxx",
     "categoryId": "cat_yyy"
   }
```

#### Restore Card Assignments Only

```
1. Keep current category structure
2. Restore only which cards belong where
3. API: POST /api/v1/refactor/restore-assignments
   {
     "snapshotId": "snap_xxx",
     "categoryIds": ["cat_a", "cat_b"]  // Optional filter
   }
```

---

## Timeline & Snapshot Management

### Reading the Timeline

The structural timeline shows all refactoring events:

```
┌─────────────────────────────────────────────────────────┐
│ Structural Timeline                                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ● Today, 2:30 PM                                       │
│   SPLIT: "Programming" → 3 children                    │
│   ├── Created: "Data Structures" (45 cards)            │
│   ├── Created: "Algorithms" (38 cards)                 │
│   └── Created: "Design Patterns" (22 cards)            │
│   📸 Pre-operation snapshot: snap_abc123               │
│                                                         │
│ ○ Yesterday, 10:15 AM                                  │
│   MOVE: "React" → under "Frontend"                     │
│   └── Moved with 3 child categories                    │
│   📸 Pre-operation snapshot: snap_def456               │
│                                                         │
│ ○ 3 days ago                                           │
│   MERGE: "JS Basics" + "ES6" → "JavaScript"            │
│   ├── Combined: 89 cards                               │
│   └── Resolved: 3 duplicate cards (kept newest)        │
│   📸 Pre-operation snapshot: snap_ghi789               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Snapshot Comparison

Compare any two snapshots to see structural differences:

```
Comparing: snap_abc123 ↔ snap_def456

Added Categories:
  + Data Structures
  + Algorithms
  + Design Patterns

Removed Categories:
  - (none)

Modified Categories:
  ~ Programming (105 → 0 cards, now parent-only)

Card Movements:
  45 cards: Programming → Data Structures
  38 cards: Programming → Algorithms
  22 cards: Programming → Design Patterns
```

### Manual Snapshot Best Practices

Create manual snapshots:

1. **Before major reorganization sessions**

   ```
   "Starting Q4 knowledge reorganization"
   ```

2. **After achieving a good structure**

   ```
   "Completed physics curriculum organization"
   ```

3. **Before experimental changes**

   ```
   "Testing new hierarchy approach"
   ```

4. **At learning milestones**
   ```
   "Finished Spanish A2 - structure finalized"
   ```

---

## Best Practices

### General Principles

#### 1. Refactor with Purpose

Every structural change should answer: "How does this help learning?"

```
Good: "Splitting 'Math' because calculus and statistics
       need different retention targets"

Bad:  "Splitting 'Math' because the category looks too big"
```

#### 2. Let AI Assist, Not Decide

AI suggestions are based on:

- Content similarity analysis
- Co-occurrence patterns in reviews
- Semantic clustering

But you know:

- Your learning goals
- How you think about the material
- What distinctions matter to you

**Use AI suggestions as a starting point, then refine.**

#### 3. Small, Incremental Changes

Instead of one massive reorganization:

```
Week 1: Split "Science" into major branches
Week 2: Refine "Physics" subcategories
Week 3: Organize "Chemistry" topics
...
```

#### 4. Document Your Reasoning

When prompted for operation description, be specific:

```
Good: "Splitting vocabulary by JLPT level to target N3
       exam preparation separately"

Bad:  "reorganizing"
```

This helps future-you understand past decisions.

### Operation-Specific Tips

#### Splitting

- Start with AI suggestions, they often identify natural clusters
- Aim for roughly equal-sized children when possible
- Ensure distinctions are meaningful, not arbitrary
- Consider future growth - will subcategories need sub-subcategories?

#### Merging

- Merge when distinction has become artificial
- Keep the name that best represents combined content
- Choose conflict resolution strategy before starting
- Review duplicate handling carefully

#### Moving

- Visualize the full tree before and after
- Consider sibling relationships at destination
- Avoid deep nesting (aim for ≤ 4 levels)
- Update any external references (if applicable)

### Red Flags

🚩 **Stop and reconsider if:**

- You're refactoring the same category repeatedly
- The operation affects > 500 cards
- You're uncertain about the target structure
- There are pending reviews in affected categories
- You haven't synced recently

---

## Troubleshooting

### Common Issues

#### "Snapshot not found"

**Cause**: Snapshot expired or was deleted

**Solution**:

1. Check snapshot retention settings
2. Look for nearby snapshots in timeline
3. Manual recreation may be needed

#### "Circular reference detected"

**Cause**: Attempted to move category under its own descendant

**Solution**:

1. Move the blocking descendant first
2. Then complete original move
3. Restructure to avoid the cycle

#### "Card assignment conflict"

**Cause**: Card claimed by multiple categories during split

**Solution**:

1. Review the card content
2. Choose the most appropriate category
3. Consider if card should be duplicated with different focus

#### "FSRS parameter mismatch"

**Cause**: Merging categories with very different learning histories

**Solution**:

1. Consider keeping categories separate
2. Or accept parameter averaging
3. Or reset and re-learn parameters

#### "Operation timed out"

**Cause**: Large operation exceeded time limit

**Solution**:

1. Break into smaller operations
2. Split/merge fewer cards at once
3. Try during low-activity period

### Getting Help

If you encounter issues not covered here:

1. **Check the Timeline**: The structural timeline shows exactly what happened
2. **Create a Snapshot**: Before trying fixes, snapshot current state
3. **Use Compare**: Compare current state with last-known-good snapshot
4. **Rollback if Needed**: Snapshots exist specifically for recovery

---

## Quick Reference

### Keyboard Shortcuts (Desktop)

| Action              | Shortcut                      |
| ------------------- | ----------------------------- |
| Create Snapshot     | `Ctrl/Cmd + Shift + S`        |
| Open Timeline       | `Ctrl/Cmd + Shift + T`        |
| Quick Split         | `Ctrl/Cmd + Shift + P`        |
| Undo Last Operation | `Ctrl/Cmd + Z` (within 5 min) |

### API Endpoints

```
POST   /api/v1/refactor/split          Split category
POST   /api/v1/refactor/merge          Merge categories
POST   /api/v1/refactor/move           Move category
GET    /api/v1/refactor/timeline       Get event timeline
GET    /api/v1/refactor/snapshots      List snapshots
POST   /api/v1/refactor/snapshots      Create snapshot
GET    /api/v1/refactor/snapshots/:id  Get snapshot detail
POST   /api/v1/refactor/compare        Compare snapshots
POST   /api/v1/refactor/rollback       Rollback to snapshot
POST   /api/v1/refactor/validate/*     Validate operations
GET    /api/v1/refactor/ai/split       Get AI split suggestions
GET    /api/v1/refactor/ai/merge       Get AI merge suggestions
```

### Emergency Recovery

If something goes wrong:

```
1. DON'T PANIC - snapshots have your back
2. Open Structural Timeline (Ctrl/Cmd + Shift + T)
3. Find pre-operation snapshot
4. Click "Compare with Current"
5. Review differences
6. Click "Rollback to This Snapshot"
7. Verify structure restored
```

---

## Appendix: Structural Integrity Rules

The system enforces these rules to maintain structural integrity:

1. **No orphan cards**: Every card must belong to exactly one category
2. **No circular hierarchies**: A → B → A is prevented
3. **Maximum depth**: Default 10 levels (configurable)
4. **Unique siblings**: No two siblings can have the same name
5. **Atomic operations**: Refactoring either completes fully or not at all
6. **Audit trail**: All structural changes are logged with timestamps
7. **Snapshot before mutation**: Pre-operation snapshots are mandatory

---

_Last updated: Document generated as part of "Subcategories as Cognitive Refinement" feature implementation._
