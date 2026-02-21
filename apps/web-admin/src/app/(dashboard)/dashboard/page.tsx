/**
 * Admin Dashboard Overview Page
 */

'use client';

import { useUsers } from '@noema/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@noema/ui';
import { Activity, UserCheck, Users, UserX, type LucideIcon } from 'lucide-react';

function StatCard({
  title,
  value,
  description,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboardPage() {
  const { data: usersData } = useUsers();

  const users = usersData?.data.items || [];
  const totalUsers = usersData?.data.total || 0;

  // Compute stats from user data
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const activeUsers = users.filter(
    (u) => u.status === 'ACTIVE' && u.lastLoginAt && new Date(u.lastLoginAt) >= sevenDaysAgo
  ).length;
  const inactiveUsers = users.filter(
    (u) => !u.lastLoginAt || new Date(u.lastLoginAt) < thirtyDaysAgo
  ).length;
  const recentRegistrations = [...users]
    .filter((u) => u.createdAt && new Date(u.createdAt) >= thirtyDaysAgo)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Platform overview and statistics.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Users"
          value={totalUsers}
          description="Registered accounts"
          icon={Users}
        />
        <StatCard title="Active Users" value={activeUsers} description="Last 7 days" icon={UserCheck} />
        <StatCard
          title="Inactive Users"
          value={inactiveUsers}
          description="No activity in 30 days"
          icon={UserX}
        />
        <StatCard title="Daily Sessions" value={0} description="Today" icon={Activity} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Registrations</CardTitle>
            <CardDescription>Newly registered users</CardDescription>
          </CardHeader>
          <CardContent>
            {recentRegistrations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent registrations.</p>
            ) : (
              <div className="space-y-3">
                {recentRegistrations.map((user) => (
                  <div key={user.id} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{user.displayName || user.username}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System Health</CardTitle>
            <CardDescription>Service status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-sm">All systems operational</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
