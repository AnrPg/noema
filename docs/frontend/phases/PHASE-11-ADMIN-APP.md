# Phase 11 — Web Admin: Governance & Content Oversight

> **Codename:** `Hypothalamus`  
> **Depends on:** Phase 0 (Tokens), Phase 1 (UI Primitives), Phase 2 (API Client
> — KG module for CKG), Phase 8 (Graph components)  
> **Unlocks:** Nothing (terminal leaf)  
> **Estimated effort:** 4–5 days

---

## Philosophy

The hypothalamus regulates homeostasis — the admin app regulates Noema's
knowledge integrity. This app serves platform administrators who manage users,
review CKG mutation proposals, and monitor content health. It reuses the design
system and graph components from the learner app, but its layout and UX are
optimized for workflow efficiency rather than learning immersion.

The existing `apps/web-admin` has a Next.js scaffold with login, dashboard,
users, settings, and activity routes — some with basic implementations. This
phase completes them and adds the CKG governance pipeline.

---

## Tasks

### T11.1 — Admin Dashboard Enhancement

Upgrade the existing `apps/web-admin/src/app/(dashboard)/dashboard/page.tsx`.

**Sections:**

**System Health Row** — 4 `MetricTile` components:

- Total users (from `useUsers()` count)
- Total cards (from `useCardStats()` → total)
- Active sessions right now (from some session query with `state=ACTIVE` filter
  — may need an admin-scoped query)
- CKG Mutation queue depth (from `useCKGMutations({ status: 'PROPOSED' })` →
  count)

**Pending Actions:**

- A prioritized list of items requiring admin attention:
  - Mutations awaiting review (PROPOSED or VALIDATED state) — count + "Review"
    link
  - Users flagged by automated systems (if any) — count + "Manage" link
  - Content with validation errors — count + "Inspect" link
- Each action row uses `StateChip` for status and priority-colored left border

**Recent Activity Feed:**

- Chronological list of recent platform events:
  - User registrations
  - CKG mutations submitted/approved/rejected
  - Batch card uploads
- Each entry: timestamp (relative), actor, action description, link to detail

### T11.2 — User Management Pages

Complete the existing user management routes.

**User List** (`/dashboard/users`):

- Enhance the existing page with:
  - Search by username, email, display name
  - Filter by role (user, admin)
  - Filter by status (active, suspended, deleted)
  - Sort by created date, last login, activity
  - Pagination via `useUsers(filters, pagination)`
- Each row: avatar, username, email, roles (as pills), status chip, last login
  (relative time), actions dropdown
- Actions: "View profile", "Edit roles", "Suspend", "Delete (soft)", "Delete
  (hard)"

**User Detail** (`/dashboard/users/[id]`):

- Complete profile view from `useUser(id)`:
  - Profile card: avatar, display name, username, email, bio, language,
    timezone, country
  - Account info: roles, status, created at, last login, email verified badge
  - Login history: list of recent login events (if exposed by the API)
- **Admin actions panel**:
  - Role management: toggle admin role
  - Account status: suspend/unsuspend, soft delete, hard delete with
    confirmation
  - Password reset: trigger a password reset flow
- Session history summary: count of sessions, cards reviewed, recent activity

### T11.3 — CKG Mutation Pipeline

The core admin workflow — reviewing and governing canonical knowledge graph
changes.

**Mutation Queue** (`/dashboard/ckg/mutations`):

- Route: `apps/web-admin/src/app/(dashboard)/ckg/mutations/page.tsx`
- List of mutations from `useCKGMutations(filters)`:
  - Filter by state: PROPOSED, VALIDATING, VALIDATED, PROVING, PROVEN,
    COMMITTING, COMMITTED, FAILED, CANCELLED
  - Filter by mutation type (node addition, edge addition, modification,
    deletion)
  - Sort by submission date, priority
- Each row: mutation ID (monospace), type badge, state `StateChip`, submitter,
  affected nodes/edges count, submitted date
- Clicking a row → navigates to mutation detail

**Mutation Detail** (`/dashboard/ckg/mutations/[id]`):

- Route: `apps/web-admin/src/app/(dashboard)/ckg/mutations/[id]/page.tsx`
- **Mutation summary card**:
  - Mutation ID, type, current state as `StateChip`
  - Submitter info (user or system/agent ID)
  - Submission date, last state transition date
- **Change visualization**:
  - A mini `GraphCanvas` showing the affected CKG region:
    - Existing nodes/edges in their normal colors
    - Proposed additions in neuron green with a "+" overlay
    - Proposed deletions in cortex red with a strikethrough
    - Proposed modifications with a before/after split (left=old, right=new)
  - Textual diff: list of specific changes (node labels, edge types, weights,
    properties)
- **Typestate audit trail**:
  - Timeline of all state transitions from `CkgMutationAuditLog`:
    - Each entry: from-state → to-state, timestamp, actor (admin/system), reason
  - Rendered as a vertical timeline with `StateChip` at each step
- **Action buttons** (only shown for states where admin action is possible):
  - "Approve" → `useApproveMutation(id)` → advances to next state
  - "Reject" → `useRejectMutation(id)` → requires a reason/text input
  - "Request revision" → sends back to submitter with feedback
  - "Cancel" → cancels the mutation entirely
- **Evidence panel**: any aggregation evidence or supporting data that
  accompanied the mutation proposal

### T11.4 — CKG Graph Browser

An admin-only CKG graph visualization at `/dashboard/ckg/graph`.

**Route:** `apps/web-admin/src/app/(dashboard)/ckg/graph/page.tsx`

**Reuse the `GraphCanvas` component from Phase 8** with the following
differences:

- Data source: `useCKGNodes()` + `useCKGEdges()` instead of PKG
- The graph is read-only — no node/edge creation from the graph UI (CKG changes
  go through the mutation pipeline)
- Additional overlay: "Pending mutations" — shows nodes/edges with pending
  mutations highlighted in myelin with a clock icon
- Node detail panel includes: "View pending mutations" link → filters mutation
  queue to this node's mutations
- Traversal exploration: subgraph queries, prerequisite chains, centrality
  analysis — all via CKG traversal endpoints

### T11.5 — Content Oversight Page

A card monitoring view for admins at `/dashboard/content`.

**Route:** `apps/web-admin/src/app/(dashboard)/content/page.tsx`

**Sections:**

**Content Statistics:**

- `MetricTile` row: total cards, cards by state (pie chart), cards by type
  (treemap or top-10 bar chart)
- Template count, media upload count + total storage usage

**Card Browser** (admin-scoped — can see all users' cards):

- Same `DeckQueryFilter` interface as the learner card library, but with an
  additional "User" filter
- Each card row includes the owning user's username
- Admin actions per card: "View", "Suspend", "Archive", "Hard delete"

**Template Management:**

- List of all templates with: name, card type, creator, usage count
- Create/edit/delete template actions
- Template editor: the same dynamic form from Phase 6 Card Creator, but in
  template mode

### T11.6 — Admin Sidebar & Layout Polish

Update the admin authenticated layout:

- **Sidebar navigation** with groupings:
  - _Overview_: Dashboard
  - _Knowledge_: CKG Mutations, CKG Graph
  - _Content_: Card Browser, Templates
  - _Users_: User List
  - _System_: Settings, Activity Log
- Apply the same neuroscience palette from Phase 0 (dark mode default)
- Admin branding: "Noema Admin" wordmark with a different accent (use dendrite
  instead of synapse to distinguish from learner app)

---

## Acceptance Criteria

- [ ] Admin Dashboard shows real-time system health metrics and pending action
      counts
- [ ] User List supports search, filter by role/status, and pagination
- [ ] User Detail shows full profile with admin action panel (role mgmt,
      suspend, delete)
- [ ] CKG Mutation Queue lists mutations with state filtering and pagination
- [ ] Mutation Detail shows change visualization on a mini graph, audit trail
      timeline, and approve/reject actions
- [ ] CKG Graph Browser renders the canonical graph read-only with pending
      mutation overlay
- [ ] Content Oversight shows platform-wide card statistics and admin card
      browser
- [ ] Template management supports CRUD operations
- [ ] All admin-only mutations require confirmation dialogs
- [ ] Admin sidebar uses dendrite accent to distinguish from learner app

---

## Files Created / Touched

| File                                                               | Description                           |
| ------------------------------------------------------------------ | ------------------------------------- |
| `apps/web-admin/src/app/(dashboard)/dashboard/page.tsx`            | **Updated** — Enhanced dashboard      |
| `apps/web-admin/src/app/(dashboard)/ckg/mutations/page.tsx`        | **New** — Mutation queue              |
| `apps/web-admin/src/app/(dashboard)/ckg/mutations/[id]/page.tsx`   | **New** — Mutation detail             |
| `apps/web-admin/src/app/(dashboard)/ckg/graph/page.tsx`            | **New** — CKG graph browser           |
| `apps/web-admin/src/app/(dashboard)/content/page.tsx`              | **New** — Content oversight           |
| `apps/web-admin/src/app/(dashboard)/content/templates/page.tsx`    | **New** — Template management         |
| `apps/web-admin/src/app/(dashboard)/users/page.tsx`                | **Updated** — Enhanced user list      |
| `apps/web-admin/src/app/(dashboard)/users/[id]/page.tsx`           | **Updated** — Enhanced user detail    |
| `apps/web-admin/src/app/(dashboard)/layout.tsx`                    | **Updated** — Sidebar + layout polish |
| `apps/web-admin/src/components/mutations/mutation-graph-diff.tsx`  | **New** — Change visualization        |
| `apps/web-admin/src/components/mutations/mutation-audit-trail.tsx` | **New** — Typestate timeline          |
| `apps/web-admin/src/components/mutations/mutation-actions.tsx`     | **New** — Approve/reject panel        |
| `apps/web-admin/src/components/content/admin-card-browser.tsx`     | **New** — Admin card list             |
