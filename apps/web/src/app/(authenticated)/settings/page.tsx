/**
 * Settings Page
 *
 * Grouped into independent sections — each saves separately.
 * Uses useMySettings() to load and useUpdateSettings() for partial saves.
 * Theme toggle is wired to useTheme() from @noema/ui.
 * Delete account requires typing the username as a safety gate.
 */

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  useChangePassword,
  useDeleteAccount,
  useMySettings,
  useUpdateSettings,
} from '@noema/api-client';
import { useAuth } from '@noema/auth';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  FormField,
  Input,
  PasswordInput,
  Skeleton,
  useTheme,
} from '@noema/ui';
import { Moon, Sun, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { toast } from '@/hooks/use-toast';

// ============================================================================
// Schemas
// ============================================================================

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Must contain at least one number')
      .regex(/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/, 'Must contain a special character'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type PasswordFormData = z.infer<typeof passwordSchema>;

// ============================================================================
// Appearance Section
// ============================================================================

function AppearanceSection(): React.JSX.Element {
  const { theme, setTheme } = useTheme();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>Choose how Noema looks to you</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Theme</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Currently:{' '}
              {theme === 'system' ? 'System default' : theme === 'dark' ? 'Dark' : 'Light'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={theme === 'light' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setTheme('light');
              }}
            >
              <Sun className="mr-1.5 h-3.5 w-3.5" />
              Light
            </Button>
            <Button
              variant={theme === 'dark' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setTheme('dark');
              }}
            >
              <Moon className="mr-1.5 h-3.5 w-3.5" />
              Dark
            </Button>
            <Button
              variant={theme === 'system' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setTheme('system');
              }}
            >
              System
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Study Preferences Section
// ============================================================================

function StudyPreferencesSection(): React.JSX.Element {
  const { data: settings, isLoading } = useMySettings();
  const updateSettings = useUpdateSettings();

  const handleDailyGoalChange = async (value: number): Promise<void> => {
    try {
      await updateSettings.mutateAsync({
        data: { dailyGoal: value },
        version: settings?.version ?? 0,
      });
      toast.success('Daily goal updated.');
    } catch {
      toast.error('Failed to update daily goal.');
    }
  };

  const handleToggle = async (field: 'studyReminders', value: boolean): Promise<void> => {
    try {
      await updateSettings.mutateAsync({
        data: { [field]: value },
        version: settings?.version ?? 0,
      });
      toast.success('Preferences updated.');
    } catch {
      toast.error('Failed to update preferences.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Study Preferences</CardTitle>
        <CardDescription>Customize your learning experience</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton variant="text" className="w-full" />
            <Skeleton variant="text" className="w-3/4" />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Daily goal</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Cards to review per day:{' '}
                    <span className="font-mono font-medium">{settings?.dailyGoal ?? 20}</span>
                  </p>
                </div>
              </div>
              <input
                type="range"
                min={1}
                max={100}
                defaultValue={settings?.dailyGoal ?? 20}
                className="w-full accent-primary"
                onMouseUp={(e) => {
                  void handleDailyGoalChange(Number((e.target as HTMLInputElement).value));
                }}
                onTouchEnd={(e) => {
                  void handleDailyGoalChange(Number((e.target as HTMLInputElement).value));
                }}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>1</span>
                <span>100</span>
              </div>
            </div>
            <hr className="border-border" />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Study reminders</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Get notified when it&apos;s time to review
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings?.studyReminders ?? false}
                onClick={() => {
                  void handleToggle('studyReminders', !(settings?.studyReminders ?? false));
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  (settings?.studyReminders ?? false) ? 'bg-primary' : 'bg-input'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    (settings?.studyReminders ?? false) ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Notifications Section
// ============================================================================

const NOTIFICATION_TOGGLES: {
  key: 'emailNotifications' | 'pushNotifications';
  label: string;
  description: string;
}[] = [
  {
    key: 'emailNotifications',
    label: 'Email notifications',
    description: 'Receive updates and reminders by email',
  },
  {
    key: 'pushNotifications',
    label: 'Push notifications',
    description: 'Receive browser push notifications',
  },
];

function NotificationsSection(): React.JSX.Element {
  const { data: settings, isLoading } = useMySettings();
  const updateSettings = useUpdateSettings();

  const handleToggle = async (
    field: 'emailNotifications' | 'pushNotifications',
    value: boolean
  ): Promise<void> => {
    try {
      await updateSettings.mutateAsync({
        data: { [field]: value },
        version: settings?.version ?? 0,
      });
      toast.success('Notification settings updated.');
    } catch {
      toast.error('Failed to update notification settings.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>Choose how you want to be notified</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton variant="text" className="w-full" />
            <Skeleton variant="text" className="w-3/4" />
          </div>
        ) : (
          NOTIFICATION_TOGGLES.map((item, i) => (
            <div key={item.key}>
              {i > 0 && <hr className="border-border mb-4" />}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings?.[item.key] ?? false}
                  onClick={() => {
                    void handleToggle(item.key, !(settings?.[item.key] ?? false));
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    (settings?.[item.key] ?? false) ? 'bg-primary' : 'bg-input'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      (settings?.[item.key] ?? false) ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Accessibility Section
// ============================================================================

const ACCESSIBILITY_TOGGLES: {
  key: 'soundEnabled' | 'hapticEnabled';
  label: string;
  description: string;
}[] = [
  {
    key: 'soundEnabled',
    label: 'Sound effects',
    description: 'Play sounds on card interactions',
  },
  {
    key: 'hapticEnabled',
    label: 'Haptic feedback',
    description: 'Vibration feedback on mobile devices',
  },
];

function AccessibilitySection(): React.JSX.Element {
  const { data: settings, isLoading } = useMySettings();
  const updateSettings = useUpdateSettings();

  const handleToggle = async (
    field: 'soundEnabled' | 'hapticEnabled',
    value: boolean
  ): Promise<void> => {
    try {
      await updateSettings.mutateAsync({
        data: { [field]: value },
        version: settings?.version ?? 0,
      });
      toast.success('Accessibility settings updated.');
    } catch {
      toast.error('Failed to update accessibility settings.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Accessibility</CardTitle>
        <CardDescription>Adjust interaction feedback</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton variant="text" className="w-full" />
            <Skeleton variant="text" className="w-3/4" />
          </div>
        ) : (
          ACCESSIBILITY_TOGGLES.map((item, i) => (
            <div key={item.key}>
              {i > 0 && <hr className="border-border mb-4" />}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings?.[item.key] ?? false}
                  onClick={() => {
                    void handleToggle(item.key, !(settings?.[item.key] ?? false));
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    (settings?.[item.key] ?? false) ? 'bg-primary' : 'bg-input'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      (settings?.[item.key] ?? false) ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Change Password Section
// ============================================================================

function ChangePasswordSection(): React.JSX.Element {
  const changePassword = useChangePassword();
  const { user } = useAuth();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
  });

  const onSubmit = async (data: PasswordFormData): Promise<void> => {
    try {
      await changePassword.mutateAsync({
        data: {
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
        },
        version: user?.version ?? 0,
      });
      toast.success('Password changed successfully.');
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Password change failed.');
    }
  };

  return (
    <Card>
      <form onSubmit={(e) => void handleSubmit(onSubmit)(e)}>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>Update your password to keep your account secure</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField label="Current password" error={errors.currentPassword?.message} required>
            <PasswordInput
              placeholder="••••••••"
              autoComplete="current-password"
              {...register('currentPassword')}
            />
          </FormField>
          <FormField
            label="New password"
            error={errors.newPassword?.message}
            description="At least 8 characters with uppercase, lowercase, number, and special character"
            required
          >
            <PasswordInput
              placeholder="••••••••"
              autoComplete="new-password"
              {...register('newPassword')}
            />
          </FormField>
          <FormField label="Confirm new password" error={errors.confirmPassword?.message} required>
            <PasswordInput
              placeholder="••••••••"
              autoComplete="new-password"
              {...register('confirmPassword')}
            />
          </FormField>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Updating...' : 'Update password'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

// ============================================================================
// Delete Account Section
// ============================================================================

function DeleteAccountSection(): React.JSX.Element {
  const { user, logout } = useAuth();
  const deleteAccount = useDeleteAccount();
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmUsername, setConfirmUsername] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const expectedUsername = user?.username ?? '';
  const confirmationMatches = confirmUsername === expectedUsername;

  const handleDelete = async (): Promise<void> => {
    if (!confirmationMatches) return;
    try {
      setIsDeleting(true);
      await deleteAccount.mutateAsync();
      await logout();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Account deletion failed.');
      setIsDeleting(false);
    }
  };

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="text-destructive">Danger Zone</CardTitle>
        <CardDescription>
          Permanently delete your account and all associated data. This action cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!showConfirm ? (
          <Button
            variant="destructive"
            onClick={() => {
              setShowConfirm(true);
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete my account
          </Button>
        ) : (
          <div className="space-y-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm font-medium text-destructive">
              This will permanently delete your account, all your cards, knowledge graph data, and
              cannot be reversed.
            </p>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Type your username{' '}
                <span className="font-mono font-semibold text-foreground">{expectedUsername}</span>{' '}
                to confirm:
              </p>
              <Input
                value={confirmUsername}
                onChange={(e) => {
                  setConfirmUsername(e.target.value);
                }}
                placeholder={expectedUsername}
                disabled={isDeleting}
                className="max-w-xs"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                onClick={() => void handleDelete()}
                disabled={isDeleting || !confirmationMatches}
              >
                {isDeleting ? 'Deleting...' : 'Yes, permanently delete my account'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowConfirm(false);
                  setConfirmUsername('');
                }}
                disabled={isDeleting}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function SettingsPage(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account settings and preferences.</p>
      </div>

      <div className="space-y-6">
        <AppearanceSection />
        <StudyPreferencesSection />
        <NotificationsSection />
        <AccessibilitySection />
        <ChangePasswordSection />
        <DeleteAccountSection />
      </div>
    </div>
  );
}
