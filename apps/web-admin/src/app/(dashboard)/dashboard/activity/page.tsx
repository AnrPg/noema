/**
 * Activity Page - Placeholder
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@noema/ui';

export default function ActivityPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Activity</h1>
        <p className="text-muted-foreground mt-1">Platform activity and audit logs.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activity Log</CardTitle>
          <CardDescription>Recent platform activity</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Activity logging coming soon.</p>
        </CardContent>
      </Card>
    </div>
  );
}
