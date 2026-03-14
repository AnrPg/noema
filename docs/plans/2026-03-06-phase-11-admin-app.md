# Phase 11 — Web Admin: Governance & Content Oversight Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the `apps/web-admin` with CKG governance pipeline, enhanced user management, content oversight, and a shared `@noema/graph` package so graph visualization is reused across both web apps.

**Architecture:**
- Create `packages/graph` (`@noema/graph`) — move all 7 graph components + `OverlayType`/`LayoutMode` types out of `apps/web`; both `apps/web` and `apps/web-admin` consume it.
- Extend `packages/api-client` — add user admin actions (patchStatus, patchRoles, triggerPasswordReset) and CKG mutation audit trail types.
- New admin pages all under `(dashboard)/dashboard/...` consistent with existing `/dashboard/users` route depth.

**Tech Stack:** Next.js 14, TypeScript, TanStack Query, `@noema/ui`, `@noema/api-client`, `@noema/graph` (new), `react-force-graph`, Tailwind CSS, Lucide React.

---

## T11.0a — Create `@noema/graph` package scaffold

**Files:**
- Create: `packages/graph/package.json`
- Create: `packages/graph/tsconfig.json`
- Create: `packages/graph/tsconfig.build.json`
- Create: `packages/graph/src/types.ts`
- Create: `packages/graph/src/index.ts`

**Step 1: Create `packages/graph/package.json`**

```json
{
  "name": "@noema/graph",
  "version": "0.1.0",
  "description": "Shared graph visualization components for Noema web applications",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc --build",
    "clean": "rm -rf dist .turbo tsconfig.tsbuildinfo",
    "dev": "tsc --watch",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@noema/api-client": "workspace:*",
    "@noema/ui": "workspace:*",
    "lucide-react": "^0.460.0",
    "react-force-graph": "^1.47.6"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "next": "^14.2.18",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "typescript": "^5.7.2"
  },
  "peerDependencies": {
    "next": "^14.0.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "publishConfig": {
    "access": "public",
    "registry": "https://npm.pkg.github.com"
  }
}
```

**Step 2: Create `packages/graph/tsconfig.json`**

```json
{
  "extends": "../../packages/config/tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "declarationMap": true,
    "composite": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

Check what `tsconfig.base.json` looks like in `packages/config/` first:
```bash
cat packages/config/tsconfig.base.json
```
Mirror the pattern from `packages/ui/tsconfig.json` exactly.

**Step 3: Create `packages/graph/tsconfig.build.json`**

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "dist", "**/*.test.ts", "**/*.test.tsx"]
}
```

**Step 4: Create `packages/graph/src/types.ts`**

Extract the domain types out of `graph-store.ts`:

```typescript
/**
 * @noema/graph — Domain Types
 *
 * OverlayType and LayoutMode are defined here (not in apps/web)
 * so that both apps/web and apps/web-admin can consume them
 * without a circular dependency.
 */

export type OverlayType =
  | 'centrality'
  | 'frontier'
  | 'misconceptions'
  | 'bridges'
  | 'prerequisites'
  | 'pending_mutations'; // admin-only overlay for CKG browser

export type LayoutMode = 'force' | 'hierarchical' | 'radial';
```

Note: `pending_mutations` is a new overlay value needed by T11.4 (CKG Graph Browser).

**Step 5: Create `packages/graph/src/index.ts`** (placeholder — will be filled in T11.0b)

```typescript
export type { OverlayType, LayoutMode } from './types.js';
// Component exports added in T11.0b after files are copied
```

**Step 6: Install and verify package is recognized**

```bash
pnpm install
```

Expected: pnpm resolves `@noema/graph` as a workspace package.

**Step 7: Commit**

```bash
git add packages/graph/
git commit -m "feat(graph): T11.0a — @noema/graph package scaffold"
```

---

## T11.0b — Migrate graph components from `apps/web` to `@noema/graph`

**Files:**
- Create: `packages/graph/src/graph-node.tsx` (copy + update imports)
- Create: `packages/graph/src/graph-edge.tsx` (copy + update imports)
- Create: `packages/graph/src/graph-canvas.tsx` (copy + update imports)
- Create: `packages/graph/src/graph-controls.tsx` (copy + update imports)
- Create: `packages/graph/src/graph-legend.tsx` (copy + update imports)
- Create: `packages/graph/src/graph-minimap.tsx` (copy + update imports)
- Create: `packages/graph/src/node-detail-panel.tsx` (copy + update imports)
- Modify: `packages/graph/src/index.ts` (add all exports)
- Modify: `apps/web/src/stores/graph-store.ts` (import types from `@noema/graph`)
- Modify: `apps/web/src/components/graph/*.tsx` (convert to re-exports from `@noema/graph`)
- Modify: `apps/web/package.json` (add `@noema/graph: workspace:*`)
- Modify: `apps/web-admin/package.json` (add `@noema/graph: workspace:*`)

**Step 1: Read all 7 source files before touching anything**

```bash
cat apps/web/src/components/graph/graph-node.tsx
cat apps/web/src/components/graph/graph-edge.tsx
cat apps/web/src/components/graph/graph-canvas.tsx
cat apps/web/src/components/graph/graph-controls.tsx
cat apps/web/src/components/graph/graph-legend.tsx
cat apps/web/src/components/graph/graph-minimap.tsx
cat apps/web/src/components/graph/node-detail-panel.tsx
```

**Step 2: Copy each file to `packages/graph/src/`, updating imports**

For each file, the import change rules are:
- `from '@/stores/graph-store'` → `from './types.js'`
- `from './graph-node.js'` / `from './graph-edge.js'` etc. → same (they're co-located now)
- `from '@noema/api-client'` → unchanged (already a dep of @noema/graph)
- `from '@noema/ui'` → unchanged
- `from 'next/link'` → unchanged (next is a peerDep)

Example — `packages/graph/src/graph-canvas.tsx` header change:
```tsx
// Before:
import type { OverlayType, LayoutMode } from '@/stores/graph-store';
// After:
import type { OverlayType, LayoutMode } from './types.js';
```

**Step 3: Update `packages/graph/src/index.ts`**

```typescript
/**
 * @noema/graph — Shared graph visualization package
 */

// Types
export type { OverlayType, LayoutMode } from './types.js';

// Draw helpers (re-exported for consumers that need canvas primitives)
export { drawNode, nodeRadius, NODE_TYPE_COLOR } from './graph-node.js';
export { drawEdge, EDGE_COLOR_MAP } from './graph-edge.js';
export type { INodeDrawOptions, IEdgeDrawOptions } from './graph-node.js';

// Components
export { GraphCanvas } from './graph-canvas.js';
export { GraphControls } from './graph-controls.js';
export { GraphLegend } from './graph-legend.js';
export { GraphMinimap } from './graph-minimap.js';
export { NodeDetailPanel } from './node-detail-panel.js';

// Prop types
export type { IGraphCanvasProps } from './graph-canvas.js';
export type { INodeDetailPanelProps } from './node-detail-panel.js';
```

**Step 4: Update `apps/web/src/stores/graph-store.ts`**

Remove the `OverlayType` and `LayoutMode` type definitions and import them from `@noema/graph`:

```typescript
import type { OverlayType, LayoutMode } from '@noema/graph';
// Remove the local type definitions for OverlayType and LayoutMode
// Re-export them so existing consumers that import from graph-store still work:
export type { OverlayType, LayoutMode };
```

**Step 5: Convert `apps/web/src/components/graph/` files to barrel re-exports**

Replace each file in `apps/web/src/components/graph/` with a thin re-export so existing imports in `apps/web` continue to work without updating every consumer:

`apps/web/src/components/graph/graph-canvas.tsx`:
```typescript
export { GraphCanvas, type IGraphCanvasProps } from '@noema/graph';
```

`apps/web/src/components/graph/graph-node.tsx`:
```typescript
export { drawNode, nodeRadius, NODE_TYPE_COLOR, type INodeDrawOptions } from '@noema/graph';
```

`apps/web/src/components/graph/graph-edge.tsx`:
```typescript
export { drawEdge, EDGE_COLOR_MAP, type IEdgeDrawOptions } from '@noema/graph';
```

`apps/web/src/components/graph/graph-controls.tsx`:
```typescript
export { GraphControls } from '@noema/graph';
```

`apps/web/src/components/graph/graph-legend.tsx`:
```typescript
export { GraphLegend } from '@noema/graph';
```

`apps/web/src/components/graph/graph-minimap.tsx`:
```typescript
export { GraphMinimap } from '@noema/graph';
```

`apps/web/src/components/graph/node-detail-panel.tsx`:
```typescript
export { NodeDetailPanel, type INodeDetailPanelProps } from '@noema/graph';
```

**Step 6: Add `@noema/graph` to both app package.json files**

In `apps/web/package.json`, add to `dependencies`:
```json
"@noema/graph": "workspace:*"
```

In `apps/web-admin/package.json`, add to `dependencies`:
```json
"@noema/graph": "workspace:*"
```

**Step 7: Run pnpm install and typecheck**

```bash
pnpm install
cd packages/graph && pnpm typecheck
cd apps/web && pnpm typecheck
```

Expected: no errors.

**Step 8: Commit**

```bash
git add packages/graph/src/ apps/web/src/stores/graph-store.ts apps/web/src/components/graph/ apps/web/package.json apps/web-admin/package.json
git commit -m "feat(graph): T11.0b — migrate graph components to @noema/graph shared package"
```

---

## T11.0c — API client additions: user admin mutations + mutation audit trail

**Files:**
- Modify: `packages/api-client/src/user/types.ts`
- Modify: `packages/api-client/src/user/api.ts`
- Modify: `packages/api-client/src/hooks/index.ts`
- Modify: `packages/api-client/src/knowledge-graph/types.ts`
- Modify: `packages/api-client/src/knowledge-graph/api.ts`
- Modify: `packages/api-client/src/knowledge-graph/hooks.ts`
- Modify: `packages/api-client/src/knowledge-graph/index.ts`
- Modify: `packages/api-client/src/user/index.ts`
- Modify: `packages/api-client/src/index.ts`

**Step 1: Read files before modifying**

```bash
cat packages/api-client/src/user/types.ts
cat packages/api-client/src/user/api.ts
cat packages/api-client/src/hooks/index.ts
cat packages/api-client/src/knowledge-graph/types.ts
cat packages/api-client/src/knowledge-graph/api.ts
cat packages/api-client/src/knowledge-graph/hooks.ts
cat packages/api-client/src/knowledge-graph/index.ts
cat packages/api-client/src/user/index.ts
cat packages/api-client/src/index.ts
```

**Step 2: Add to `packages/api-client/src/user/types.ts`**

Add after the `IUserFilters` interface:

```typescript
// Add role filter for admin list filtering
export interface IUserFilters {
  status?: UserStatus;
  emailVerified?: boolean;
  search?: string;
  role?: UserRole;  // ADD THIS
}

// Admin mutation inputs
export interface IUpdateUserStatusInput {
  status: UserStatus;
}

export interface IUpdateUserRolesInput {
  roles: UserRole[];
}

// Response types for new admin operations
export type UpdateUserStatusResponse = IApiResponse<IUserDto>;
export type UpdateUserRolesResponse = IApiResponse<IUserDto>;
export type TriggerPasswordResetResponse = IApiResponse<{ message: string }>;
```

**Step 3: Add admin methods to `packages/api-client/src/user/api.ts`**

Add to `usersApi` object:

```typescript
export const usersApi = {
  // ...existing methods...

  /**
   * Update user account status (admin only).
   * PATCH /users/:id/status
   */
  patchStatus: (id: string, data: IUpdateUserStatusInput): Promise<UpdateUserStatusResponse> =>
    http.patch(`/users/${id}/status`, data),

  /**
   * Update user roles (admin only).
   * PATCH /users/:id/roles
   */
  patchRoles: (id: string, data: IUpdateUserRolesInput): Promise<UpdateUserRolesResponse> =>
    http.patch(`/users/${id}/roles`, data),

  /**
   * Trigger a password reset email for a user (admin only).
   * POST /users/:id/password-reset
   */
  triggerPasswordReset: (id: string): Promise<TriggerPasswordResetResponse> =>
    http.post(`/users/${id}/password-reset`, {}),
};
```

**Step 4: Add admin mutation hooks to `packages/api-client/src/hooks/index.ts`**

Add after `useDeleteUser`:

```typescript
export function useUpdateUserStatus(
  options?: UseMutationOptions<UpdateUserStatusResponse, Error, { id: string; status: UserStatus }>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }) => usersApi.patchStatus(id, { status }),
    onSuccess: (response, { id }) => {
      queryClient.setQueryData(userKeys.detail(id), response);
      void queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
    ...options,
  });
}

export function useUpdateUserRoles(
  options?: UseMutationOptions<UpdateUserRolesResponse, Error, { id: string; roles: UserRole[] }>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, roles }) => usersApi.patchRoles(id, { roles }),
    onSuccess: (response, { id }) => {
      queryClient.setQueryData(userKeys.detail(id), response);
      void queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
    ...options,
  });
}

export function useTriggerPasswordReset(
  options?: UseMutationOptions<TriggerPasswordResetResponse, Error, string>
) {
  return useMutation({
    mutationFn: (id) => usersApi.triggerPasswordReset(id),
    ...options,
  });
}
```

Also add the necessary imports at the top of `hooks/index.ts`:
```typescript
import type {
  // ...existing imports...
  UserRole,
  UserStatus,
  UpdateUserStatusResponse,
  UpdateUserRolesResponse,
  TriggerPasswordResetResponse,
} from '../user/types.js';
```

**Step 5: Add mutation audit trail to `packages/api-client/src/knowledge-graph/types.ts`**

Add after `ICkgMutationDto`:

```typescript
// Audit trail for a mutation's typestate transitions
export interface ICkgMutationAuditEntry {
  id: string;
  mutationId: MutationId;
  fromStatus: MutationStatus | null; // null for initial creation
  toStatus: MutationStatus;
  actorId: string; // admin user ID or 'system'
  actorType: 'admin' | 'system';
  reason: string | null;
  transitionedAt: string;
}

export interface ICkgMutationAuditLogDto {
  mutationId: MutationId;
  entries: ICkgMutationAuditEntry[];
}

// Update ICkgMutationDto to include optional audit log when requested
// (separate API call returns the full log)
```

Add response type:
```typescript
export type CkgMutationAuditLogResponse = IApiResponse<ICkgMutationAuditLogDto>;
```

**Step 6: Add audit log API call to `packages/api-client/src/knowledge-graph/api.ts`**

Add to `ckgMutationsApi`:

```typescript
export const ckgMutationsApi = {
  // ...existing methods...

  getAuditLog: (mutationId: MutationId): Promise<CkgMutationAuditLogResponse> =>
    http.get(`${ckgBase}/mutations/${mutationId}/audit-log`),

  requestRevision: (mutationId: MutationId, feedback: string): Promise<CkgMutationResponse> =>
    http.post(`${ckgBase}/mutations/${mutationId}/request-revision`, { feedback }),
};
```

**Step 7: Add audit log hook to `packages/api-client/src/knowledge-graph/hooks.ts`**

Add after `useRejectMutation`:

```typescript
export function useCKGMutationAuditLog(
  id: MutationId,
  options?: Omit<
    UseQueryOptions<CkgMutationAuditLogResponse, Error, ICkgMutationAuditLogDto>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: [...kgKeys.ckgMutation(id), 'audit-log'] as const,
    queryFn: () => ckgMutationsApi.getAuditLog(id),
    select: (r) => r.data,
    enabled: id !== '',
    ...options,
  });
}

export function useRequestRevision(
  options?: UseMutationOptions<CkgMutationResponse, Error, { id: MutationId; feedback: string }>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, feedback }) => ckgMutationsApi.requestRevision(id, feedback),
    onSuccess: (response, { id }) => {
      queryClient.setQueryData(kgKeys.ckgMutation(id), response);
      void queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutations() });
    },
    ...options,
  });
}

export function useCancelMutation(
  options?: UseMutationOptions<CkgMutationResponse, Error, MutationId>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => ckgMutationsApi.cancel(id),
    onSuccess: (response, id) => {
      queryClient.setQueryData(kgKeys.ckgMutation(id), response);
      void queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutations() });
    },
    ...options,
  });
}
```

**Step 8: Export new types from `packages/api-client/src/knowledge-graph/index.ts`**

Check what's already exported and add:
```typescript
export type {
  ICkgMutationAuditEntry,
  ICkgMutationAuditLogDto,
  CkgMutationAuditLogResponse,
} from './types.js';
export {
  useCKGMutationAuditLog,
  useRequestRevision,
  useCancelMutation,
} from './hooks.js';
```

**Step 9: Export new user admin hooks from `packages/api-client/src/index.ts`**

Check what's already exported and add:
```typescript
export {
  useUpdateUserStatus,
  useUpdateUserRoles,
  useTriggerPasswordReset,
} from './hooks/index.js';
export type {
  IUpdateUserStatusInput,
  IUpdateUserRolesInput,
  UpdateUserStatusResponse,
  UpdateUserRolesResponse,
  TriggerPasswordResetResponse,
} from './user/types.js';
```

**Step 10: Typecheck**

```bash
cd packages/api-client && pnpm typecheck
```

Expected: no errors.

**Step 11: Commit**

```bash
git add packages/api-client/
git commit -m "feat(api-client): T11.0c — user admin mutations, CKG audit trail hooks"
```

---

## T11.1 — Admin Dashboard Enhancement

**Files:**
- Modify: `apps/web-admin/src/app/(dashboard)/dashboard/page.tsx`

**Step 1: Read the existing dashboard page**

```bash
cat apps/web-admin/src/app/(dashboard)/dashboard/page.tsx
```

**Step 2: Write the failing test** (skip — no test infra in web-admin; verify visually)

**Step 3: Rewrite `dashboard/page.tsx`**

Replace entirely. The new page has three sections:

**System Health Row** — 4 MetricTile components from `@noema/ui`:
- "Total Users" from `useUsers()` → `data?.data.total`
- "Total Cards" from `useCardStats()` → `data?.total`
- "Pending Mutations" from `useCKGMutations({ status: 'pending' })` → `data?.length`
- "Active Sessions" — placeholder with 0 (no admin session stats endpoint yet — use a TODO comment)

```tsx
'use client';
/**
 * Admin Dashboard Overview Page — Phase 11 Enhancement
 */
import * as React from 'react';
import Link from 'next/link';
import { useCKGMutations, useCardStats, useUsers } from '@noema/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, MetricTile, StateChip } from '@noema/ui';
import { Activity, AlertCircle, ArrowRight, Clock, FileWarning, GitMerge, Users } from 'lucide-react';
```

**Pending Actions list** — rows with `StateChip`, priority-colored left border, count + link:
- Mutations awaiting review: count of `useCKGMutations({ status: 'pending' })`
- Content with errors: count from `useCardStats()` — cards in DRAFT with no content (use `byState.DRAFT` as proxy)

Each row pattern:
```tsx
<div className="flex items-center gap-4 border-l-4 border-yellow-500 pl-4 py-2">
  <div className="flex-1">
    <p className="font-medium text-sm">{count} mutations awaiting review</p>
  </div>
  <StateChip status="warning" label="PENDING" />
  <Link href="/dashboard/ckg/mutations">
    <Button size="sm" variant="outline">Review <ArrowRight className="ml-1 h-3 w-3" /></Button>
  </Link>
</div>
```

**Recent Activity Feed** — static placeholder list from user registrations (last 5 users from `useUsers()`):
- Entry format: relative timestamp, actor display name, action description, link

```tsx
{recentUsers.map(user => (
  <div key={user.id} className="flex items-center gap-3 py-2 border-b last:border-0">
    <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
    <div className="flex-1 min-w-0">
      <p className="text-sm">
        <span className="font-medium">{user.displayName}</span> registered
      </p>
      <p className="text-xs text-muted-foreground">{relativeTime(user.createdAt)}</p>
    </div>
    <Link href={`/dashboard/users/${user.id}`} className="text-xs text-primary hover:underline">
      View
    </Link>
  </div>
))}
```

**Step 4: Run typecheck**

```bash
cd apps/web-admin && pnpm typecheck
```

**Step 5: Commit**

```bash
git add apps/web-admin/src/app/(dashboard)/dashboard/page.tsx
git commit -m "feat(web-admin): T11.1 — enhanced dashboard with MetricTile row, pending actions, activity feed"
```

---

## T11.2 — User Management Pages

**Files:**
- Modify: `apps/web-admin/src/app/(dashboard)/dashboard/users/page.tsx`
- Modify: `apps/web-admin/src/app/(dashboard)/dashboard/users/[id]/page.tsx`

**Step 1: Read existing files**

```bash
cat apps/web-admin/src/app/(dashboard)/dashboard/users/page.tsx
cat apps/web-admin/src/app/(dashboard)/dashboard/users/[id]/page.tsx
```

**Step 2: Enhance User List**

Add to the existing page:
- Role filter (`Select` with options: All, user, admin, moderator) — uses `IUserFilters.role`
- Status filter (`Select` with options: All, ACTIVE, SUSPENDED, BANNED, DEACTIVATED, PENDING)
- Sort controls: Created, Last Login
- Each row: add roles as pill badges, status `StateChip`, last login relative time
- Actions: "View details", "Edit roles", "Suspend/Unsuspend", "Soft delete", "Hard delete"
- Pagination: proper page controls using `offset`/`limit`

Add to `UserRow` component — role pills:
```tsx
<div className="flex gap-1">
  {user.roles.map(role => (
    <span key={role} className="px-1.5 py-0.5 rounded text-xs font-mono bg-primary/10 text-primary">
      {role}
    </span>
  ))}
</div>
```

Replace status div with `StateChip`:
```tsx
<StateChip
  status={user.status === 'ACTIVE' ? 'success' : user.status === 'SUSPENDED' ? 'warning' : 'error'}
  label={user.status}
/>
```

The `handleAction` function needs to call `useUpdateUserStatus`:
```tsx
const updateStatus = useUpdateUserStatus();
// For 'suspend':
await updateStatus.mutateAsync({ id: user.id, status: 'SUSPENDED' });
// For 'unsuspend':
await updateStatus.mutateAsync({ id: user.id, status: 'ACTIVE' });
```

**Step 3: Enhance User Detail**

Add **Admin Actions Panel** card after the bio section:

```tsx
<Card className="border-orange-500/30">
  <CardHeader>
    <CardTitle className="text-lg flex items-center gap-2">
      <Shield className="h-5 w-5 text-orange-500" />
      Admin Actions
    </CardTitle>
    <CardDescription>Actions require confirmation. Cannot be undone.</CardDescription>
  </CardHeader>
  <CardContent className="space-y-4">
    {/* Role management */}
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium">Toggle Admin Role</p>
        <p className="text-xs text-muted-foreground">Grant or revoke admin privileges</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleToggleAdmin}
        disabled={updateRoles.isPending}
      >
        {user.roles.includes('admin') ? 'Remove Admin' : 'Grant Admin'}
      </Button>
    </div>
    <Separator />
    {/* Suspend/unsuspend */}
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium">Account Status</p>
        <p className="text-xs text-muted-foreground">Current: {user.status}</p>
      </div>
      <Button
        variant={user.status === 'ACTIVE' ? 'destructive' : 'default'}
        size="sm"
        onClick={handleToggleSuspend}
        disabled={updateStatus.isPending}
      >
        {user.status === 'ACTIVE' ? 'Suspend' : 'Unsuspend'}
      </Button>
    </div>
    <Separator />
    {/* Password reset */}
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium">Password Reset</p>
        <p className="text-xs text-muted-foreground">Send reset email</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handlePasswordReset}
        disabled={triggerReset.isPending || triggerReset.isSuccess}
      >
        {triggerReset.isSuccess ? 'Email Sent' : 'Send Reset Email'}
      </Button>
    </div>
    <Separator />
    {/* Delete */}
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-destructive">Delete Account</p>
        <p className="text-xs text-muted-foreground">Soft delete (recoverable)</p>
      </div>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => { setShowDeleteConfirm(true); }}
      >
        Delete
      </Button>
    </div>
  </CardContent>
</Card>
```

Confirmation dialog for delete:
```tsx
{showDeleteConfirm && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <Card className="w-96">
      <CardHeader>
        <CardTitle>Confirm Delete</CardTitle>
        <CardDescription>
          Type "{user.username}" to confirm deletion of this account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          value={deleteConfirmInput}
          onChange={e => setDeleteConfirmInput(e.target.value)}
          placeholder={user.username}
        />
        <div className="flex gap-2">
          <Button
            variant="destructive"
            disabled={deleteConfirmInput !== user.username || deleteUser.isPending}
            onClick={handleConfirmDelete}
          >
            Delete Account
          </Button>
          <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>
)}
```

**Step 4: Typecheck**

```bash
cd apps/web-admin && pnpm typecheck
```

**Step 5: Commit**

```bash
git add "apps/web-admin/src/app/(dashboard)/dashboard/users/"
git commit -m "feat(web-admin): T11.2 — enhanced user list filters/pagination, user detail admin actions panel"
```

---

## T11.3 — CKG Mutation Pipeline

**Files:**
- Create: `apps/web-admin/src/app/(dashboard)/dashboard/ckg/mutations/page.tsx`
- Create: `apps/web-admin/src/app/(dashboard)/dashboard/ckg/mutations/[id]/page.tsx`
- Create: `apps/web-admin/src/components/mutations/mutation-graph-diff.tsx`
- Create: `apps/web-admin/src/components/mutations/mutation-audit-trail.tsx`
- Create: `apps/web-admin/src/components/mutations/mutation-actions.tsx`

**Step 1: Create `mutation-graph-diff.tsx`**

Mini GraphCanvas showing affected CKG region with diff overlays:

```tsx
'use client';
/**
 * MutationGraphDiff — Mini graph visualization for a CKG mutation.
 *
 * Shows the affected subgraph with:
 * - Proposed additions in neuron green (#22d3ee) with "+" label overlay
 * - Proposed deletions in cortex red (#ec4899) with strikethrough overlay
 * - Proposed modifications split left=old / right=new
 */
import * as React from 'react';
import { GraphCanvas } from '@noema/graph';
import type { ICkgMutationDto, IGraphNodeDto, IGraphEdgeDto } from '@noema/api-client';
import { useCKGNodes, useCKGEdges } from '@noema/api-client';

export interface IMutationGraphDiffProps {
  mutation: ICkgMutationDto;
  className?: string;
}

export function MutationGraphDiff({ mutation, className }: IMutationGraphDiffProps): React.JSX.Element {
  const { data: allNodes = [] } = useCKGNodes();
  const { data: allEdges = [] } = useCKGEdges();

  // Extract affected node/edge IDs from mutation payload
  const affectedNodeIds = React.useMemo(() => {
    const payload = mutation.payload;
    const ids = new Set<string>();
    if (typeof payload.nodeId === 'string') ids.add(payload.nodeId);
    if (typeof payload.sourceId === 'string') ids.add(payload.sourceId);
    if (typeof payload.targetId === 'string') ids.add(payload.targetId);
    return ids;
  }, [mutation.payload]);

  // Filter to subgraph: affected nodes + 1 hop neighbors
  const subgraphNodes = React.useMemo(() => {
    const neighborIds = new Set<string>(affectedNodeIds);
    for (const edge of allEdges) {
      const src = edge.sourceId as unknown as string;
      const tgt = edge.targetId as unknown as string;
      if (affectedNodeIds.has(src)) neighborIds.add(tgt);
      if (affectedNodeIds.has(tgt)) neighborIds.add(src);
    }
    return allNodes.filter(n => neighborIds.has(n.id as unknown as string));
  }, [allNodes, allEdges, affectedNodeIds]);

  const subgraphEdges = React.useMemo(() => {
    const nodeIdSet = new Set(subgraphNodes.map(n => n.id as unknown as string));
    return allEdges.filter(e => {
      const src = e.sourceId as unknown as string;
      const tgt = e.targetId as unknown as string;
      return nodeIdSet.has(src) && nodeIdSet.has(tgt);
    });
  }, [subgraphNodes, allEdges]);

  // Highlight affected nodes
  const highlightedIds = React.useMemo(
    () => new Set<string>(Array.from(affectedNodeIds)),
    [affectedNodeIds]
  );

  if (subgraphNodes.length === 0) {
    return (
      <div className={`flex items-center justify-center h-64 bg-muted/20 rounded-lg ${className ?? ''}`}>
        <p className="text-sm text-muted-foreground">No graph data available for this mutation</p>
      </div>
    );
  }

  return (
    <div className={`rounded-lg overflow-hidden border ${className ?? 'h-80'}`}>
      <GraphCanvas
        nodes={subgraphNodes}
        edges={subgraphEdges}
        highlightedNodeIds={highlightedIds}
        className="h-full w-full"
      />
    </div>
  );
}
```

**Step 2: Create `mutation-audit-trail.tsx`**

Vertical timeline of typestate transitions:

```tsx
'use client';
/**
 * MutationAuditTrail — Vertical timeline for CKG mutation state transitions.
 */
import * as React from 'react';
import { useCKGMutationAuditLog } from '@noema/api-client';
import type { MutationId } from '@noema/types';
import { StateChip } from '@noema/ui';
import { ArrowRight, Bot, User } from 'lucide-react';

export function MutationAuditTrail({ mutationId }: { mutationId: MutationId }): React.JSX.Element {
  const { data: log, isLoading } = useCKGMutationAuditLog(mutationId);

  if (isLoading) {
    return <div className="animate-pulse h-32 bg-muted/20 rounded-lg" />;
  }

  if (!log || log.entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No audit trail entries.</p>;
  }

  return (
    <div className="space-y-0">
      {log.entries.map((entry, i) => (
        <div key={entry.id} className="flex gap-4">
          {/* Timeline connector */}
          <div className="flex flex-col items-center">
            <div className={`h-3 w-3 rounded-full mt-1.5 flex-shrink-0 ${
              entry.toStatus === 'approved' ? 'bg-green-500' :
              entry.toStatus === 'rejected' ? 'bg-red-500' :
              entry.toStatus === 'cancelled' ? 'bg-gray-500' : 'bg-blue-500'
            }`} />
            {i < log.entries.length - 1 && (
              <div className="w-px flex-1 bg-border mt-1 mb-0 min-h-8" />
            )}
          </div>
          {/* Content */}
          <div className="pb-6 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {entry.fromStatus && (
                <>
                  <StateChip status="default" label={entry.fromStatus.toUpperCase()} />
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                </>
              )}
              <StateChip
                status={
                  entry.toStatus === 'approved' ? 'success' :
                  entry.toStatus === 'rejected' ? 'error' : 'default'
                }
                label={entry.toStatus.toUpperCase()}
              />
              <div className="flex items-center gap-1 ml-auto text-xs text-muted-foreground">
                {entry.actorType === 'system' ? (
                  <Bot className="h-3 w-3" />
                ) : (
                  <User className="h-3 w-3" />
                )}
                <span>{entry.actorType === 'system' ? 'System' : entry.actorId}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(entry.transitionedAt).toLocaleString()}
            </p>
            {entry.reason && (
              <p className="text-sm mt-1 bg-muted/30 rounded px-2 py-1">{entry.reason}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

**Step 3: Create `mutation-actions.tsx`**

Action buttons panel with approve/reject/revision/cancel:

```tsx
'use client';
/**
 * MutationActions — Admin action panel for a CKG mutation.
 * Shows approve/reject/request-revision/cancel with confirmation.
 */
import * as React from 'react';
import { useApproveMutation, useCancelMutation, useRejectMutation, useRequestRevision } from '@noema/api-client';
import type { ICkgMutationDto } from '@noema/api-client';
import type { MutationId } from '@noema/types';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@noema/ui';
import { Check, MessageSquare, RotateCcw, X } from 'lucide-react';

// Only show actions for actionable states
const ACTIONABLE_STATUSES: string[] = ['pending', 'retrying'];

export function MutationActions({ mutation }: { mutation: ICkgMutationDto }): React.JSX.Element | null {
  const [rejectNote, setRejectNote] = React.useState('');
  const [revisionFeedback, setRevisionFeedback] = React.useState('');
  const [mode, setMode] = React.useState<'idle' | 'reject' | 'revision' | 'cancel'>('idle');

  const approve = useApproveMutation();
  const reject = useRejectMutation();
  const requestRevision = useRequestRevision();
  const cancel = useCancelMutation();

  const id = mutation.id as MutationId;

  if (!ACTIONABLE_STATUSES.includes(mutation.status)) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground text-center">
            No actions available — mutation is in <strong>{mutation.status}</strong> state.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Admin Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {mode === 'idle' && (
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => { approve.mutate({ id }); }}
              disabled={approve.isPending}
              className="gap-2"
            >
              <Check className="h-4 w-4" />
              Approve
            </Button>
            <Button
              variant="destructive"
              onClick={() => { setMode('reject'); }}
              className="gap-2"
            >
              <X className="h-4 w-4" />
              Reject
            </Button>
            <Button
              variant="outline"
              onClick={() => { setMode('revision'); }}
              className="gap-2"
            >
              <MessageSquare className="h-4 w-4" />
              Request Revision
            </Button>
            <Button
              variant="outline"
              onClick={() => { setMode('cancel'); }}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Cancel
            </Button>
          </div>
        )}

        {mode === 'reject' && (
          <div className="space-y-3">
            <p className="text-sm font-medium">Rejection reason (required):</p>
            <textarea
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm min-h-20 focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Explain why this mutation is being rejected..."
              value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                variant="destructive"
                disabled={rejectNote.trim() === '' || reject.isPending}
                onClick={() => { reject.mutate({ id, note: rejectNote }); }}
              >
                Confirm Reject
              </Button>
              <Button variant="ghost" onClick={() => { setMode('idle'); setRejectNote(''); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {mode === 'revision' && (
          <div className="space-y-3">
            <p className="text-sm font-medium">Feedback for submitter:</p>
            <textarea
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm min-h-20 focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="What needs to be revised?"
              value={revisionFeedback}
              onChange={e => setRevisionFeedback(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                disabled={revisionFeedback.trim() === '' || requestRevision.isPending}
                onClick={() => { requestRevision.mutate({ id, feedback: revisionFeedback }); }}
              >
                Send Feedback
              </Button>
              <Button variant="ghost" onClick={() => { setMode('idle'); setRevisionFeedback(''); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {mode === 'cancel' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Cancel this mutation permanently? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                disabled={cancel.isPending}
                onClick={() => { cancel.mutate(id); }}
              >
                Confirm Cancel
              </Button>
              <Button variant="ghost" onClick={() => { setMode('idle'); }}>
                Back
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

**Step 4: Create Mutation Queue page**

`apps/web-admin/src/app/(dashboard)/dashboard/ckg/mutations/page.tsx`:

```tsx
'use client';
/**
 * CKG Mutation Queue — Admin governance pipeline
 */
import * as React from 'react';
import Link from 'next/link';
import { useCKGMutations } from '@noema/api-client';
import type { ICkgMutationDto, MutationStatus } from '@noema/api-client';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, StateChip } from '@noema/ui';
import { ArrowRight, GitBranch } from 'lucide-react';
```

Show filters (status select), list of mutation rows with:
- Mutation ID in monospace
- Type badge (create_node / update_node / delete_node / create_edge / delete_edge) — color-coded
- Status `StateChip`
- Submitter ID
- Proposed date (relative)
- "Review" link → `/dashboard/ckg/mutations/${mutation.id}`

Status filter drives the `useCKGMutations({ status })` call:
```tsx
const [statusFilter, setStatusFilter] = React.useState<MutationStatus | undefined>('pending');
const { data: mutations = [], isLoading } = useCKGMutations(
  statusFilter ? { status: statusFilter } : undefined
);
```

**Step 5: Create Mutation Detail page**

`apps/web-admin/src/app/(dashboard)/dashboard/ckg/mutations/[id]/page.tsx`:

```tsx
'use client';
import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCKGMutation } from '@noema/api-client';
import type { MutationId } from '@noema/types';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, StateChip } from '@noema/ui';
import { ArrowLeft } from 'lucide-react';
import { MutationGraphDiff } from '@/components/mutations/mutation-graph-diff';
import { MutationAuditTrail } from '@/components/mutations/mutation-audit-trail';
import { MutationActions } from '@/components/mutations/mutation-actions';
```

Layout:
- Top: back button, mutation ID heading, status chip
- Summary card: type, submitter, proposed date, reviewed date
- Change visualization: `<MutationGraphDiff mutation={mutation} className="h-80" />`
- Textual diff: JSON diff of `mutation.payload` (render key-value pairs)
- Audit trail: `<MutationAuditTrail mutationId={id} />`
- Evidence panel: `mutation.payload` rendered as formatted JSON
- Actions panel: `<MutationActions mutation={mutation} />`

**Step 6: Typecheck**

```bash
cd apps/web-admin && pnpm typecheck
```

**Step 7: Commit**

```bash
git add apps/web-admin/src/app/(dashboard)/dashboard/ckg/ apps/web-admin/src/components/mutations/
git commit -m "feat(web-admin): T11.3 — CKG mutation queue, mutation detail, graph diff, audit trail, action panel"
```

---

## T11.4 — CKG Graph Browser

**Files:**
- Create: `apps/web-admin/src/app/(dashboard)/dashboard/ckg/graph/page.tsx`

**Step 1: Write the CKG Graph Browser page**

```tsx
'use client';
/**
 * CKG Graph Browser — Admin read-only visualization of the canonical knowledge graph.
 * Uses @noema/graph GraphCanvas with CKG data + pending mutations overlay.
 */
import * as React from 'react';
import Link from 'next/link';
import { useCKGEdges, useCKGMutations, useCKGNodes } from '@noema/api-client';
import type { IGraphNodeDto } from '@noema/api-client';
import { GraphCanvas, GraphControls, NodeDetailPanel } from '@noema/graph';
import type { LayoutMode, OverlayType } from '@noema/graph';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@noema/ui';
import { ExternalLink } from 'lucide-react';
```

Key design choices for the admin graph browser:
- Uses `useGraphStore`-equivalent local state (not shared with learner app — separate instance)
- `pending_mutations` overlay: nodes with pending mutations are highlighted in myelin (#fbbf24)
- Node detail panel shows "View pending mutations" link to `/dashboard/ckg/mutations?nodeId=X`
- No create/edit actions — read-only

```tsx
export default function CKGGraphPage(): React.JSX.Element {
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = React.useState<string | null>(null);
  const [layoutMode, setLayoutMode] = React.useState<LayoutMode>('force');
  const [activeOverlays, setActiveOverlays] = React.useState<OverlayType[]>([]);

  const { data: nodes = [], isLoading: nodesLoading } = useCKGNodes();
  const { data: edges = [], isLoading: edgesLoading } = useCKGEdges();
  // Pending mutations for overlay
  const { data: pendingMutations = [] } = useCKGMutations({ status: 'pending' });

  // Build set of node IDs with pending mutations
  const pendingMutationNodeIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const mut of pendingMutations) {
      const payload = mut.payload;
      if (typeof payload.nodeId === 'string') ids.add(payload.nodeId);
      if (typeof payload.sourceId === 'string') ids.add(payload.sourceId);
      if (typeof payload.targetId === 'string') ids.add(payload.targetId);
    }
    return ids;
  }, [pendingMutations]);

  // When pending_mutations overlay is active, highlight those nodes
  const highlightedNodeIds = React.useMemo(
    () => activeOverlays.includes('pending_mutations') ? pendingMutationNodeIds : new Set<string>(),
    [activeOverlays, pendingMutationNodeIds]
  );

  const selectedNode = React.useMemo(
    () => nodes.find(n => (n.id as unknown as string) === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  );

  const isLoading = nodesLoading || edgesLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <p className="text-muted-foreground">Loading canonical knowledge graph...</p>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col gap-4">
      <div>
        <h1 className="text-3xl font-bold">CKG Graph Browser</h1>
        <p className="text-muted-foreground mt-1">
          Canonical Knowledge Graph — read-only. {nodes.length} nodes · {edges.length} edges
          {pendingMutations.length > 0 && (
            <span className="ml-2 text-yellow-500">
              · {pendingMutations.length} pending mutation{pendingMutations.length !== 1 ? 's' : ''}
            </span>
          )}
        </p>
      </div>

      <div className="flex flex-1 gap-4 min-h-0">
        {/* Left: Controls */}
        <div className="w-72 flex-shrink-0 overflow-y-auto">
          <GraphControls
            nodes={nodes}
            layoutMode={layoutMode}
            activeOverlays={activeOverlays}
            onLayoutChange={setLayoutMode}
            onOverlayToggle={(overlay) => {
              setActiveOverlays(prev =>
                prev.includes(overlay)
                  ? prev.filter(o => o !== overlay)
                  : [...prev, overlay]
              );
            }}
            onNodeSelect={(node) => { setSelectedNodeId(node.id as unknown as string); }}
            // Admin extra overlay option
            extraOverlays={[{ key: 'pending_mutations' as OverlayType, label: 'Pending Mutations' }]}
          />
        </div>

        {/* Center: Graph canvas */}
        <div className="flex-1 relative min-w-0 rounded-lg overflow-hidden border">
          <GraphCanvas
            nodes={nodes}
            edges={edges}
            selectedNodeId={selectedNodeId}
            hoveredNodeId={hoveredNodeId}
            layoutMode={layoutMode}
            activeOverlays={activeOverlays}
            highlightedNodeIds={highlightedNodeIds}
            onNodeClick={(node) => { setSelectedNodeId(node.id as unknown as string); }}
            onNodeHover={(node) => { setHoveredNodeId(node ? node.id as unknown as string : null); }}
            onBackgroundClick={() => { setSelectedNodeId(null); }}
            className="h-full w-full"
          />
        </div>

        {/* Right: Node detail */}
        {selectedNode && (
          <div className="w-80 flex-shrink-0 overflow-y-auto">
            <NodeDetailPanel
              node={selectedNode}
              edges={edges}
              onClose={() => { setSelectedNodeId(null); }}
            />
            {/* Admin extra: "View pending mutations" link */}
            {pendingMutationNodeIds.has(selectedNode.id as unknown as string) && (
              <Card className="mt-3 border-yellow-500/30">
                <CardContent className="pt-4">
                  <Link
                    href={`/dashboard/ckg/mutations?nodeId=${selectedNode.id as unknown as string}`}
                    className="flex items-center gap-2 text-sm text-yellow-500 hover:underline"
                  >
                    <ExternalLink className="h-4 w-4" />
                    View pending mutations for this node
                  </Link>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

Note: `GraphControls` currently doesn't accept `extraOverlays`. Before writing this page, read `packages/graph/src/graph-controls.tsx` to check the prop interface. If `extraOverlays` isn't in `IGraphControlsProps`, add it as an optional prop in the package. The implementer must read and adapt accordingly.

**Step 2: Typecheck**

```bash
cd apps/web-admin && pnpm typecheck
```

**Step 3: Commit**

```bash
git add apps/web-admin/src/app/(dashboard)/dashboard/ckg/graph/
git commit -m "feat(web-admin): T11.4 — CKG graph browser with pending mutations overlay"
```

---

## T11.5 — Content Oversight Page

**Files:**
- Create: `apps/web-admin/src/app/(dashboard)/dashboard/content/page.tsx`
- Create: `apps/web-admin/src/app/(dashboard)/dashboard/content/templates/page.tsx`
- Create: `apps/web-admin/src/components/content/admin-card-browser.tsx`

**Step 1: Create `admin-card-browser.tsx`**

Admin-scoped card browser — similar to the learner card library but with a "User" filter column and admin actions:

```tsx
'use client';
/**
 * AdminCardBrowser — Platform-wide card browser for admins.
 * Shows all users' cards with admin actions per row.
 */
import * as React from 'react';
import { useCards, useCardStateTransition } from '@noema/api-client';
import type { ICardSummaryDto, CardState } from '@noema/api-client';
import { Button, Card, CardContent, CardHeader, CardTitle, StateChip } from '@noema/ui';
import { Archive, Eye, MoreVertical, Trash2 } from 'lucide-react';
```

Table layout:
- Columns: Card ID (monospace truncated), Type badge, State `StateChip`, Tags (first 2), Created, Actions
- Actions dropdown: "View", "Suspend", "Archive", "Hard delete"
- `useCards` query with `IDeckQueryInput` search/state/type filters
- State transition via `useCardStateTransition` mutation

```tsx
export function AdminCardBrowser(): React.JSX.Element {
  const [search, setSearch] = React.useState('');
  const [stateFilter, setStateFilter] = React.useState<CardState | undefined>();

  const { data, isLoading } = useCards({
    search: search || undefined,
    states: stateFilter ? [stateFilter] : undefined,
    limit: 50,
  });

  const transition = useCardStateTransition();
  const cards = data?.data.cards ?? [];

  // ...render table rows
}
```

**Step 2: Create Content Oversight page**

`apps/web-admin/src/app/(dashboard)/dashboard/content/page.tsx`:

```tsx
'use client';
/**
 * Content Oversight Page — Platform-wide card and template monitoring
 */
import * as React from 'react';
import Link from 'next/link';
import { useCardStats, useTemplates } from '@noema/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, MetricTile } from '@noema/ui';
import { BookOpen, FileText, Layers } from 'lucide-react';
import { AdminCardBrowser } from '@/components/content/admin-card-browser';
```

Sections:
1. **Content Statistics row** — 4 MetricTile:
   - Total cards: `stats.total`
   - Active cards: `stats.byState.ACTIVE`
   - Draft cards: `stats.byState.DRAFT`
   - Templates: `templates.length`

2. **Cards by Type** — top-10 bar chart (simple `div` bars using width percentages, no recharts dependency needed):
```tsx
{Object.entries(stats.byType)
  .sort(([,a], [,b]) => b - a)
  .slice(0, 10)
  .map(([type, count]) => (
    <div key={type} className="flex items-center gap-3 py-1">
      <span className="text-xs font-mono w-32 truncate">{type}</span>
      <div className="flex-1 bg-muted rounded-full h-2">
        <div
          className="bg-primary h-2 rounded-full transition-all"
          style={{ width: `${(count / stats.total) * 100}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground w-12 text-right">{count}</span>
    </div>
  ))}
```

3. **Admin Card Browser** — `<AdminCardBrowser />`

4. **Template Management quick link** → `/dashboard/content/templates`

**Step 3: Create Templates page**

`apps/web-admin/src/app/(dashboard)/dashboard/content/templates/page.tsx`:

```tsx
'use client';
/**
 * Template Management — Create, edit, delete card templates
 */
import * as React from 'react';
import { useCreateTemplate, useTemplates, useUpdateTemplate } from '@noema/api-client';
import type { ITemplateDto, ICreateTemplateInput } from '@noema/api-client';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@noema/ui';
import { Plus, Trash2, Pencil } from 'lucide-react';
```

List all templates in a table:
- Columns: Name, Card Type, Created At, Usage (placeholder "-"), Actions
- Create: inline form or modal with `name`, `cardType` (select from known types), `defaultContent` (JSON textarea)
- Edit: expand row with editable fields
- Delete: confirm dialog before calling `useDeleteTemplate` (add to hooks if missing, check first)

Check if `useDeleteTemplate` exists:
```bash
grep -n "useDeleteTemplate" packages/api-client/src/content/hooks.ts
```
If not found, add it:
```typescript
export function useDeleteTemplate(
  options?: UseMutationOptions<void, Error, TemplateId>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => templatesApi.deleteTemplate(id),
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: contentKeys.template(id) });
      void queryClient.invalidateQueries({ queryKey: contentKeys.templates() });
    },
    ...options,
  });
}
```

Also check if `templatesApi.deleteTemplate` exists in `packages/api-client/src/content/api.ts`. If not, add:
```typescript
export const templatesApi = {
  // ...existing...
  deleteTemplate: (id: TemplateId): Promise<void> =>
    http.delete(`/api/v1/templates/${id}`),
};
```

**Step 4: Typecheck**

```bash
cd apps/web-admin && pnpm typecheck
cd packages/api-client && pnpm typecheck
```

**Step 5: Commit**

```bash
git add apps/web-admin/src/app/(dashboard)/dashboard/content/ apps/web-admin/src/components/content/ packages/api-client/
git commit -m "feat(web-admin): T11.5 — content oversight page, admin card browser, template management"
```

---

## T11.6 — Admin Sidebar & Layout Polish

**Files:**
- Modify: `apps/web-admin/src/app/(dashboard)/layout.tsx`

**Step 1: Read the existing layout**

```bash
cat apps/web-admin/src/app/(dashboard)/layout.tsx
```

**Step 2: Update `navItems` with 5 groups**

```typescript
const navItems = [
  {
    title: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/dashboard/activity', label: 'Activity', icon: Activity },
    ],
  },
  {
    title: 'Knowledge',
    items: [
      { href: '/dashboard/ckg/mutations', label: 'CKG Mutations', icon: GitMerge },
      { href: '/dashboard/ckg/graph', label: 'CKG Graph', icon: Network },
    ],
  },
  {
    title: 'Content',
    items: [
      { href: '/dashboard/content', label: 'Card Browser', icon: BookOpen },
      { href: '/dashboard/content/templates', label: 'Templates', icon: FileText },
    ],
  },
  {
    title: 'Users',
    items: [
      { href: '/dashboard/users', label: 'User List', icon: Users },
    ],
  },
  {
    title: 'System',
    items: [
      { href: '/dashboard/settings', label: 'Settings', icon: Settings },
    ],
  },
];
```

Import new icons: `GitMerge, Network, BookOpen, FileText` from `lucide-react`.

**Step 3: Update admin branding**

Replace the `Shield` icon with a dendrite-accented header:
```tsx
<DashboardSidebar
  header={
    <div className="flex items-center gap-2">
      <div className="h-6 w-6 rounded-sm bg-[#86efac] flex items-center justify-center">
        {/* Dendrite green accent — distinct from learner app's synapse purple */}
        <Network className="h-4 w-4 text-[#0a0a12]" />
      </div>
      <span className="font-bold text-lg">Noema Admin</span>
    </div>
  }
>
```

The dendrite color `#86efac` (dendrite-400 from Phase 0 palette) distinguishes this from the learner app which uses synapse purple `#7c6ee6`.

**Step 4: Fix active state detection for nested routes**

The current `active={pathname === item.href}` breaks for nested routes like `/dashboard/ckg/mutations/abc123`. Use `startsWith` for parent routes:

```tsx
active={
  item.href === '/dashboard'
    ? pathname === '/dashboard'
    : pathname.startsWith(item.href)
}
```

**Step 5: Typecheck and lint**

```bash
cd apps/web-admin && pnpm typecheck && pnpm lint
```

**Step 6: Commit**

```bash
git add apps/web-admin/src/app/(dashboard)/layout.tsx
git commit -m "feat(web-admin): T11.6 — sidebar 5-group nav, dendrite accent branding, active-route fix"
```

---

## Final Verification

**Step 1: Full typecheck across all modified packages**

```bash
pnpm -r typecheck
```

**Step 2: Lint all modified packages**

```bash
pnpm -r lint
```

**Step 3: Fix any errors before marking complete**

All typecheck and lint errors introduced by Phase 11 must be resolved. Pre-existing errors in unmodified files should be documented but not fixed unless they are in files that were touched.

**Step 4: Verify route completeness**

Confirm all routes resolve:
- `GET /dashboard` — dashboard page ✓ (enhanced)
- `GET /dashboard/users` — user list ✓ (enhanced)
- `GET /dashboard/users/[id]` — user detail ✓ (enhanced + admin panel)
- `GET /dashboard/ckg/mutations` — mutation queue ✓ (new)
- `GET /dashboard/ckg/mutations/[id]` — mutation detail ✓ (new)
- `GET /dashboard/ckg/graph` — CKG graph browser ✓ (new)
- `GET /dashboard/content` — content oversight ✓ (new)
- `GET /dashboard/content/templates` — template management ✓ (new)

---

## Files Created / Touched Summary

| File | Status |
|------|--------|
| `packages/graph/package.json` | **New** |
| `packages/graph/tsconfig.json` | **New** |
| `packages/graph/src/types.ts` | **New** |
| `packages/graph/src/graph-canvas.tsx` | **New** (moved from apps/web) |
| `packages/graph/src/graph-node.tsx` | **New** (moved from apps/web) |
| `packages/graph/src/graph-edge.tsx` | **New** (moved from apps/web) |
| `packages/graph/src/graph-controls.tsx` | **New** (moved from apps/web) |
| `packages/graph/src/graph-legend.tsx` | **New** (moved from apps/web) |
| `packages/graph/src/graph-minimap.tsx` | **New** (moved from apps/web) |
| `packages/graph/src/node-detail-panel.tsx` | **New** (moved from apps/web) |
| `packages/graph/src/index.ts` | **New** |
| `apps/web/src/stores/graph-store.ts` | **Updated** — imports OverlayType/LayoutMode from @noema/graph |
| `apps/web/src/components/graph/*.tsx` | **Updated** — thin re-exports from @noema/graph |
| `apps/web/package.json` | **Updated** — add @noema/graph dep |
| `apps/web-admin/package.json` | **Updated** — add @noema/graph dep |
| `packages/api-client/src/user/types.ts` | **Updated** — IUserFilters role, admin input types |
| `packages/api-client/src/user/api.ts` | **Updated** — patchStatus, patchRoles, triggerPasswordReset |
| `packages/api-client/src/hooks/index.ts` | **Updated** — useUpdateUserStatus, useUpdateUserRoles, useTriggerPasswordReset |
| `packages/api-client/src/knowledge-graph/types.ts` | **Updated** — ICkgMutationAuditEntry, ICkgMutationAuditLogDto |
| `packages/api-client/src/knowledge-graph/api.ts` | **Updated** — getAuditLog, requestRevision |
| `packages/api-client/src/knowledge-graph/hooks.ts` | **Updated** — useCKGMutationAuditLog, useRequestRevision, useCancelMutation |
| `apps/web-admin/src/app/(dashboard)/dashboard/page.tsx` | **Updated** — MetricTile row, pending actions, activity feed |
| `apps/web-admin/src/app/(dashboard)/dashboard/users/page.tsx` | **Updated** — filters, status chip, role pills |
| `apps/web-admin/src/app/(dashboard)/dashboard/users/[id]/page.tsx` | **Updated** — admin actions panel |
| `apps/web-admin/src/app/(dashboard)/dashboard/ckg/mutations/page.tsx` | **New** |
| `apps/web-admin/src/app/(dashboard)/dashboard/ckg/mutations/[id]/page.tsx` | **New** |
| `apps/web-admin/src/app/(dashboard)/dashboard/ckg/graph/page.tsx` | **New** |
| `apps/web-admin/src/app/(dashboard)/dashboard/content/page.tsx` | **New** |
| `apps/web-admin/src/app/(dashboard)/dashboard/content/templates/page.tsx` | **New** |
| `apps/web-admin/src/components/mutations/mutation-graph-diff.tsx` | **New** |
| `apps/web-admin/src/components/mutations/mutation-audit-trail.tsx` | **New** |
| `apps/web-admin/src/components/mutations/mutation-actions.tsx` | **New** |
| `apps/web-admin/src/components/content/admin-card-browser.tsx` | **New** |
| `apps/web-admin/src/app/(dashboard)/layout.tsx` | **Updated** — 5-group nav, dendrite accent |
