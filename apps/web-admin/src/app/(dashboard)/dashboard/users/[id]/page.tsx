/**
 * User Detail Page
 */

'use client';

import { useUser } from '@noema/api-client';
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
  Separator,
} from '@noema/ui';
import { ArrowLeft, Mail, Globe, Clock, Shield, Calendar, type LucideIcon } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: user, isLoading, error } = useUser(params.id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-muted-foreground">Loading user details...</p>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to users
        </Button>
        <div className="flex items-center justify-center py-16">
          <p className="text-muted-foreground">User not found.</p>
        </div>
      </div>
    );
  }

  const initials =
    user.displayName
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase() || 'U';

  const statusColor =
    user.status === 'ACTIVE'
      ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
      : user.status === 'SUSPENDED'
        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
        : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => router.push('/dashboard/users')}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to users
      </Button>

      {/* Profile Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-6">
            <Avatar className="h-20 w-20">
              <AvatarImage src={user.avatarUrl || undefined} />
              <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <CardTitle className="text-2xl">{user.displayName}</CardTitle>
              <CardDescription className="text-base">@{user.username}</CardDescription>
              <div className="flex items-center gap-2 pt-1">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor}`}>
                  {user.status}
                </span>
                {user.roles.map((role) => (
                  <span
                    key={role}
                    className="rounded-full border px-2 py-0.5 text-xs font-medium"
                  >
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
            <InfoRow icon={Globe} label="Language" value={user.language?.toUpperCase() || '—'} />
            <InfoRow icon={Clock} label="Timezone" value={user.timezone || '—'} />
            {user.country && <InfoRow icon={Globe} label="Country" value={user.country} />}
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
                user.lastLoginAt
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
              <span>{user.version}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bio */}
      {user.bio && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Bio</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{user.bio}</p>
          </CardContent>
        </Card>
      )}
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
}) {
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
