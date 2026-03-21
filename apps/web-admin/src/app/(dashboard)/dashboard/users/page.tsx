/**
 * Users Management Page
 */

'use client';

import type { UserDto, UserRole, UserStatus } from '@noema/api-client';
import { useDeleteUser, useUpdateUserStatus, useUsers } from '@noema/api-client';
import { getUserDisplayName, getUserInitials } from '@noema/auth/user-display';
import {
  Alert,
  AlertDescription,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
} from '@noema/ui';
import {
  AlertCircle,
  CheckCircle,
  Eye,
  MoreVertical,
  Search,
  Trash2,
  UserCheck,
  UserX,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { useState } from 'react';

const PAGE_SIZE = 20;
const HIDDEN_UI_ROLES: ReadonlySet<UserRole> = new Set(['user']);
const ROLE_OPTIONS: UserRole[] = ['learner', 'premium', 'creator', 'admin', 'super_admin'];

function visibleRoles(roles: readonly UserRole[]): UserRole[] {
  return roles.filter((role) => !HIDDEN_UI_ROLES.has(role));
}

function statusColor(status: UserStatus): string {
  switch (status) {
    case 'ACTIVE':
      return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
    case 'SUSPENDED':
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300';
    case 'BANNED':
      return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300';
    case 'DEACTIVATED':
      return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
    case 'PENDING':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
  }
}

function UserRow({
  user,
  onAction,
  deletingUserId,
  setDeletingUserId,
}: {
  user: UserDto;
  onAction: (action: 'view' | 'suspend' | 'unsuspend' | 'delete', user: UserDto) => void;
  deletingUserId: string | null;
  setDeletingUserId: (id: string | null) => void;
}): React.JSX.Element {
  const displayName = getUserDisplayName(user);
  const initials = getUserInitials(user);

  const lastLogin =
    user.lastLoginAt !== null ? new Date(user.lastLoginAt).toLocaleDateString() : 'Never';

  return (
    <div className="flex items-center justify-between py-4">
      <div className="flex items-center gap-4">
        <Avatar>
          <AvatarImage src={user.avatarUrl ?? undefined} />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div>
          <p className="font-medium">{displayName}</p>
          <p className="text-sm text-muted-foreground">{user.email}</p>
          <p className="text-xs text-muted-foreground">Last login: {lastLogin}</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex gap-1">
          {visibleRoles(user.roles).map((role: UserRole) => (
            <span
              key={role}
              className="px-1.5 py-0.5 rounded text-xs font-mono bg-primary/10 text-primary border border-primary/20"
            >
              {role}
            </span>
          ))}
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(user.status)}`}
        >
          {user.status}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                onAction('view', user);
              }}
            >
              <Eye className="mr-2 h-4 w-4" />
              View details
            </DropdownMenuItem>
            {user.status === 'ACTIVE' ? (
              <DropdownMenuItem
                onClick={() => {
                  onAction('suspend', user);
                }}
              >
                <UserX className="mr-2 h-4 w-4" />
                Suspend
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={() => {
                  onAction('unsuspend', user);
                }}
              >
                <UserCheck className="mr-2 h-4 w-4" />
                Unsuspend
              </DropdownMenuItem>
            )}
            {deletingUserId === user.id ? (
              <div className="flex items-center gap-1 px-2 py-1.5">
                <span className="text-xs text-destructive">Delete?</span>
                <button
                  className="text-xs text-destructive underline underline-offset-2 hover:no-underline"
                  onClick={() => {
                    onAction('delete', user);
                  }}
                >
                  Yes
                </button>
                <button
                  className="text-xs text-muted-foreground underline underline-offset-2 hover:no-underline"
                  onClick={() => {
                    setDeletingUserId(null);
                  }}
                >
                  No
                </button>
              </div>
            ) : (
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => {
                  setDeletingUserId(user.id as string);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export default function UsersPage(): React.JSX.Element {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<UserStatus | ''>('');
  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [allUsers, setAllUsers] = React.useState<UserDto[]>([]);
  const [appliedFilterKey, setAppliedFilterKey] = React.useState('');
  const router = useRouter();

  const filters = {
    ...(search !== '' ? { search } : {}),
    ...(statusFilter !== '' ? { status: statusFilter } : {}),
    ...(roleFilter !== '' ? { roles: [roleFilter] } : {}),
  };
  const filterKey = JSON.stringify({
    search,
    statusFilter,
    roleFilter,
  });

  const hasFilters = search !== '' || statusFilter !== '' || roleFilter !== '';
  const {
    data: usersData,
    isLoading,
    refetch,
  } = useUsers(hasFilters ? filters : undefined, {
    offset: (page - 1) * PAGE_SIZE,
    limit: PAGE_SIZE,
  });
  const deleteUser = useDeleteUser();
  const updateStatus = useUpdateUserStatus();

  React.useEffect(() => {
    if (usersData === undefined) return;

    const incoming = usersData.data.items;
    if (page === 1) {
      setAllUsers(incoming);
      setAppliedFilterKey(filterKey);
      return;
    }

    setAllUsers((prev) => {
      const seen = new Set(prev.map((user) => user.id));
      const next = incoming.filter((user) => !seen.has(user.id));
      return [...prev, ...next];
    });
    setAppliedFilterKey(filterKey);
  }, [filterKey, page, usersData]);

  // Reset pagination when filters change
  React.useEffect(() => {
    setPage(1);
  }, [statusFilter, roleFilter, search]);

  const isRefreshingFirstPage = isLoading && page === 1 && appliedFilterKey !== filterKey;
  const visibleUsers = isRefreshingFirstPage ? [] : allUsers;

  const handleAction = async (
    action: 'view' | 'suspend' | 'unsuspend' | 'delete',
    user: UserDto
  ): Promise<void> => {
    if (action === 'view') {
      router.push(`/dashboard/users/${user.id}`);
    } else if (action === 'suspend') {
      try {
        await updateStatus.mutateAsync({ id: user.id, status: 'SUSPENDED' });
        setMessage({ type: 'success', text: `${getUserDisplayName(user)} suspended.` });
        void refetch();
      } catch (err) {
        setMessage({
          type: 'error',
          text: err instanceof Error ? err.message : 'Failed to suspend user',
        });
      }
    } else if (action === 'unsuspend') {
      try {
        await updateStatus.mutateAsync({ id: user.id, status: 'ACTIVE' });
        setMessage({ type: 'success', text: `${getUserDisplayName(user)} unsuspended.` });
        void refetch();
      } catch (err) {
        setMessage({
          type: 'error',
          text: err instanceof Error ? err.message : 'Failed to unsuspend user',
        });
      }
    } else {
      try {
        await deleteUser.mutateAsync({ id: user.id, soft: true });
        setMessage({ type: 'success', text: 'User deleted successfully' });
        setDeletingUserId(null);
        void refetch();
      } catch (err) {
        setMessage({
          type: 'error',
          text: err instanceof Error ? err.message : 'Failed to delete user',
        });
        setDeletingUserId(null);
      }
    }
  };

  const total = usersData?.data.total;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Users</h1>
        <p className="text-muted-foreground mt-1">Manage user accounts and permissions.</p>
      </div>

      {message !== null && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'success'}>
          {message.type === 'error' ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <CheckCircle className="h-4 w-4" />
          )}
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{message.text}</span>
            <button
              type="button"
              aria-label="Dismiss"
              className="shrink-0 text-xs underline underline-offset-2 hover:no-underline"
              onClick={() => {
                setMessage(null);
              }}
            >
              Dismiss
            </button>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>User List</CardTitle>
          <CardDescription>
            {total !== undefined ? String(total) : String(allUsers.length)} users total
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-6 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={search}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setSearch(e.target.value);
                }}
                className="pl-10"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                setStatusFilter(e.target.value as UserStatus | '');
              }}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="PENDING">PENDING</option>
              <option value="SUSPENDED">SUSPENDED</option>
              <option value="BANNED">BANNED</option>
              <option value="DEACTIVATED">DEACTIVATED</option>
            </select>
            <select
              value={roleFilter}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                setRoleFilter(e.target.value as UserRole | '');
              }}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">All Roles</option>
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>

          {isLoading && visibleUsers.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">Loading users...</div>
          ) : visibleUsers.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No users found</div>
          ) : (
            <div className="divide-y">
              {visibleUsers.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  onAction={(action, u) => {
                    void handleAction(action, u);
                  }}
                  deletingUserId={deletingUserId}
                  setDeletingUserId={setDeletingUserId}
                />
              ))}
            </div>
          )}

          {(total === undefined || visibleUsers.length < total) && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                onClick={() => {
                  setPage((p) => p + 1);
                }}
                disabled={isLoading}
              >
                {isLoading ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
