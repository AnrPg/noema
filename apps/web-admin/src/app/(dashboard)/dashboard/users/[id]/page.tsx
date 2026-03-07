/**
 * User Detail Page
 */

'use client';

import type { UserRole } from '@noema/api-client';
import {
  useDeleteUser,
  useTriggerPasswordReset,
  useUpdateUserRoles,
  useUpdateUserStatus,
  useUser,
} from '@noema/api-client';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Separator,
} from '@noema/ui';
import { ArrowLeft, Calendar, Clock, Globe, Mail, Shield, type LucideIcon } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import React from 'react';

export default function UserDetailPage(): React.JSX.Element {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: user, isLoading, error } = useUser(params.id);

  const updateRoles = useUpdateUserRoles();
  const updateStatus = useUpdateUserStatus();
  const triggerReset = useTriggerPasswordReset();
  const deleteUser = useDeleteUser({
    onSuccess: () => {
      router.push('/dashboard/users');
    },
  });

  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = React.useState('');
  const [actionError, setActionError] = React.useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-muted-foreground">Loading user details...</p>
      </div>
    );
  }

  if (error !== null || user === undefined) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          onClick={() => {
            router.back();
          }}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to users
        </Button>
        <div className="flex items-center justify-center py-16">
          <p className="text-muted-foreground">User not found.</p>
        </div>
      </div>
    );
  }

  const rawInitials = user.displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase();
  const initials = rawInitials !== '' ? rawInitials : 'U';

  const statusColorClass =
    user.status === 'ACTIVE'
      ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
      : user.status === 'SUSPENDED'
        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
        : user.status === 'BANNED'
          ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
          : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';

  const isAdmin = user.roles.includes('admin' as UserRole);

  const handleToggleAdmin = (): void => {
    const newRoles: UserRole[] = isAdmin
      ? user.roles.filter((r) => r !== ('admin' as UserRole))
      : [...user.roles, 'admin' as UserRole];
    setActionError(null);
    updateRoles.mutate(
      { id: user.id, roles: newRoles },
      {
        onError: (err) => {
          setActionError(err.message);
        },
      }
    );
  };

  const handleToggleSuspend = (): void => {
    const newStatus = user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    setActionError(null);
    updateStatus.mutate(
      { id: user.id, status: newStatus },
      {
        onError: (err) => {
          setActionError(err.message);
        },
      }
    );
  };

  const handleConfirmDelete = (): void => {
    setActionError(null);
    deleteUser.mutate(
      { id: user.id, soft: true },
      {
        onError: (err) => {
          setActionError(err.message);
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      <Button
        variant="ghost"
        onClick={() => {
          router.push('/dashboard/users');
        }}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to users
      </Button>

      {/* Profile Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-6">
            <Avatar className="h-20 w-20">
              <AvatarImage src={user.avatarUrl ?? undefined} />
              <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <CardTitle className="text-2xl">{user.displayName}</CardTitle>
              <CardDescription className="text-base">@{user.username}</CardDescription>
              <div className="flex items-center gap-2 pt-1">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColorClass}`}
                >
                  {user.status}
                </span>
                {user.roles.map((role) => (
                  <span key={role} className="rounded-full border px-2 py-0.5 text-xs font-medium">
                    {role}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Account Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Account Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <InfoRow icon={Mail} label="Email" value={user.email} />
            <InfoRow
              icon={Shield}
              label="Email Verified"
              value={user.emailVerified ? 'Yes' : 'No'}
            />
            <InfoRow icon={Globe} label="Language" value={user.language.toUpperCase()} />
            <InfoRow
              icon={Clock}
              label="Timezone"
              value={user.timezone !== '' ? user.timezone : '—'}
            />
            {user.country !== null && <InfoRow icon={Globe} label="Country" value={user.country} />}
          </CardContent>
        </Card>

        {/* Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <InfoRow
              icon={Calendar}
              label="Registered"
              value={new Date(user.createdAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            />
            <InfoRow
              icon={Calendar}
              label="Last Login"
              value={
                user.lastLoginAt !== null
                  ? new Date(user.lastLoginAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'Never'
              }
            />
            <InfoRow
              icon={Calendar}
              label="Last Updated"
              value={new Date(user.updatedAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            />
            <Separator />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">User ID</span>
              <code className="rounded bg-muted px-2 py-0.5 text-xs">{user.id}</code>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Version</span>
              <span>{String(user.version)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bio */}
      {user.bio !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Bio</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{user.bio}</p>
          </CardContent>
        </Card>
      )}

      {/* Admin Actions Panel */}
      <Card className="border-orange-500/30">
        <CardHeader>
          <CardTitle className="text-lg">Admin Actions</CardTitle>
          <CardDescription>Manage this user&apos;s access and account state.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {actionError !== null && (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {actionError}
            </div>
          )}
          {/* Toggle Admin Role */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Admin Role</p>
              <p className="text-xs text-muted-foreground">
                {isAdmin
                  ? 'User currently has admin privileges.'
                  : 'User does not have admin privileges.'}
              </p>
            </div>
            <Button
              variant={isAdmin ? 'destructive' : 'default'}
              onClick={handleToggleAdmin}
              disabled={updateRoles.isPending}
            >
              {isAdmin ? 'Remove Admin' : 'Grant Admin'}
            </Button>
          </div>

          <Separator />

          {/* Suspend / Unsuspend */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Account Status</p>
              <p className="text-xs text-muted-foreground">
                Current status: <span className="font-semibold">{user.status}</span>
              </p>
            </div>
            <Button
              variant={user.status === 'ACTIVE' ? 'destructive' : 'default'}
              onClick={handleToggleSuspend}
              disabled={updateStatus.isPending}
            >
              {user.status === 'ACTIVE' ? 'Suspend Account' : 'Unsuspend Account'}
            </Button>
          </div>

          <Separator />

          {/* Password Reset */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Password Reset</p>
              <p className="text-xs text-muted-foreground">
                Send a password reset email to {user.email}.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setActionError(null);
                triggerReset.mutate(user.id, {
                  onError: (err) => {
                    setActionError(err.message);
                  },
                });
              }}
              disabled={triggerReset.isPending || triggerReset.isSuccess}
            >
              {triggerReset.isSuccess ? 'Email Sent ✓' : 'Send Password Reset Email'}
            </Button>
          </div>

          <Separator />

          {/* Delete Account */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-destructive">Delete Account</p>
                <p className="text-xs text-muted-foreground">
                  Permanently remove this user and all associated data.
                </p>
              </div>
              {!showDeleteConfirm && (
                <Button
                  variant="destructive"
                  onClick={() => {
                    setShowDeleteConfirm(true);
                    setDeleteConfirmInput('');
                  }}
                >
                  Delete
                </Button>
              )}
            </div>
            {showDeleteConfirm && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Type <span className="font-mono font-semibold">{user.username}</span> to confirm
                  deletion.
                </p>
                <Input
                  value={deleteConfirmInput}
                  onChange={(e) => {
                    setDeleteConfirmInput(e.target.value);
                  }}
                  placeholder={user.username}
                  className="max-w-xs"
                />
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    disabled={deleteConfirmInput !== user.username || deleteUser.isPending}
                    onClick={handleConfirmDelete}
                  >
                    Confirm Delete
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowDeleteConfirm(false);
                      setDeleteConfirmInput('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </div>
      <span className="font-medium">{value}</span>
    </div>
  );
}
