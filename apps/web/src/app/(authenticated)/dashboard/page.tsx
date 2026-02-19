/**
 * User Dashboard Page
 */

'use client';

import { useAuth } from '@noema/auth';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@noema/ui';
import { BookOpen, Brain, Clock, Target, type LucideIcon } from 'lucide-react';

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

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">
          Welcome back, {user?.displayName?.split(' ')[0]}!
        </h1>
        <p className="text-muted-foreground mt-1">
          Here's an overview of your learning progress.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Study Sessions"
          value={0}
          description="This week"
          icon={BookOpen}
        />
        <StatCard
          title="Concepts Mastered"
          value={0}
          description="Total learned"
          icon={Brain}
        />
        <StatCard
          title="Goals Completed"
          value={0}
          description="This month"
          icon={Target}
        />
        <StatCard
          title="Study Time"
          value="0h"
          description="This week"
          icon={Clock}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Your latest learning sessions</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              No recent activity. Start a study session to see your progress here!
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming Reviews</CardTitle>
            <CardDescription>Concepts due for review</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              No reviews scheduled yet. Learn some concepts to get started!
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
