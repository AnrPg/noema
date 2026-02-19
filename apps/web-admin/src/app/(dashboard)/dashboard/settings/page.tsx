/**
 * Admin Settings Page - Placeholder
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@noema/ui';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">Platform configuration and settings.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>General Settings</CardTitle>
          <CardDescription>Platform-wide configuration</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Settings management coming soon.</p>
        </CardContent>
      </Card>
    </div>
  );
}
