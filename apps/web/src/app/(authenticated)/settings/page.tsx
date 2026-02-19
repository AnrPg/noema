/**
 * Settings Page
 */

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useChangePassword, useDeleteAccount } from '@noema/api-client';
import { useAuth } from '@noema/auth';
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  FormField,
  PasswordInput,
} from '@noema/ui';
import { AlertCircle, CheckCircle, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type PasswordFormData = z.infer<typeof passwordSchema>;

function ChangePasswordCard() {
  const changePassword = useChangePassword();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
  });

  const onSubmit = async (data: PasswordFormData) => {
    try {
      setError(null);
      setSuccess(false);
      await changePassword.mutateAsync({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      setSuccess(true);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password change failed');
    }
  };

  return (
    <Card>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>Update your password to keep your account secure</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert variant="success">
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>Password changed successfully!</AlertDescription>
            </Alert>
          )}

          <FormField label="Current Password" error={errors.currentPassword?.message} required>
            <PasswordInput
              placeholder="••••••••"
              autoComplete="current-password"
              {...register('currentPassword')}
            />
          </FormField>

          <FormField
            label="New Password"
            error={errors.newPassword?.message}
            description="At least 8 characters with uppercase, lowercase, and number"
            required
          >
            <PasswordInput
              placeholder="••••••••"
              autoComplete="new-password"
              {...register('newPassword')}
            />
          </FormField>

          <FormField label="Confirm New Password" error={errors.confirmPassword?.message} required>
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

function DeleteAccountCard() {
  const { logout } = useAuth();
  const deleteAccount = useDeleteAccount();
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    try {
      setError(null);
      setIsDeleting(true);
      await deleteAccount.mutateAsync();
      await logout();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
      setIsDeleting(false);
    }
  };

  return (
    <Card className="border-destructive">
      <CardHeader>
        <CardTitle className="text-destructive">Danger Zone</CardTitle>
        <CardDescription>Permanently delete your account and all associated data</CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!showConfirm ? (
          <Button
            variant="destructive"
            onClick={() => {
              setShowConfirm(true);
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete account
          </Button>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-destructive font-medium">
              Are you sure? This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? 'Deleting...' : 'Yes, delete my account'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowConfirm(false);
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

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account settings and preferences.</p>
      </div>

      <div className="space-y-6">
        <ChangePasswordCard />

        <Card>
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
            <CardDescription>Customize your learning experience</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Learning preferences and notification settings coming soon.
            </p>
          </CardContent>
        </Card>

        <DeleteAccountCard />
      </div>
    </div>
  );
}
