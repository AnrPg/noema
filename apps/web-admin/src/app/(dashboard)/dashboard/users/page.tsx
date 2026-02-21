/**
 * Users Management Page
 */

'use client';

import type { UserDto } from '@noema/api-client';
import { useDeleteUser, useUsers } from '@noema/api-client';
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
import { AlertCircle, CheckCircle, Eye, Lock, MoreVertical, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';

function UserRow({
  user,
  onAction,
}: {
  user: UserDto;
  onAction: (action: 'view' | 'disable' | 'delete', user: UserDto) => void;
}) {
  const initials =
    user.displayName
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase() || 'U';

  return (
    <div className="flex items-center justify-between py-4">
      <div className="flex items-center gap-4">
        <Avatar>
          <AvatarImage src={user.avatarUrl || undefined} />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div>
          <p className="font-medium">{user.displayName}</p>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-sm text-muted-foreground">{user.roles.join(', ')}</div>
        <div
          className={`rounded-full px-2 py-1 text-xs ${
            user.status === 'ACTIVE'
              ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
              : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
          }`}
        >
          {user.status}
        </div>
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
            <DropdownMenuItem
              onClick={() => {
                onAction('disable', user);
              }}
            >
              <Lock className="mr-2 h-4 w-4" />
              {user.status === 'ACTIVE' ? 'Disable' : 'Enable'}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => {
                onAction('delete', user);
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { data: usersData, isLoading, refetch } = useUsers(search ? { search } : undefined);
  const deleteUser = useDeleteUser();

  const handleAction = async (action: 'view' | 'disable' | 'delete', user: UserDto) => {
    if (action === 'view') {
      // TODO: Open detail modal or navigate
      console.log('View user:', user.id);
    } else if (action === 'disable') {
      // TODO: Implement toggle status
      console.log('Toggle status:', user.id);
    } else if (action === 'delete') {
      if (confirm(`Are you sure you want to delete ${user.displayName}?`)) {
        try {
          await deleteUser.mutateAsync({ id: user.id, soft: true });
          setMessage({ type: 'success', text: 'User deleted successfully' });
          refetch();
        } catch (err) {
          setMessage({
            type: 'error',
            text: err instanceof Error ? err.message : 'Failed to delete user',
          });
        }
      }
    }
  };

  const users = usersData?.data.items || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Users</h1>
        <p className="text-muted-foreground mt-1">Manage user accounts and permissions.</p>
      </div>

      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'success'}>
          {message.type === 'error' ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <CheckCircle className="h-4 w-4" />
          )}
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>User List</CardTitle>
          <CardDescription>{usersData?.data.total || 0} users total</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                }}
                className="pl-10"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading users...</div>
          ) : users.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No users found</div>
          ) : (
            <div className="divide-y">
              {users.map((user) => (
                <UserRow key={user.id} user={user} onAction={handleAction} />
              ))}
            </div>
          )}

          {usersData && (usersData.data.total ?? 0) > users.length && (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" disabled>
                Load more
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
