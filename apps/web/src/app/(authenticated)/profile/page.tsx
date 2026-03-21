/**
 * Profile Page
 *
 * Displays the current user's profile in read mode. Clicking "Edit Profile"
 * switches to an inline form. Saves via useUpdateProfile() with optimistic
 * locking — if a version conflict occurs, the user is informed via toast.
 */

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMe, useUpdateProfile } from '@noema/api-client';
import { useAuth } from '@noema/auth';
import { getUserInitials } from '@noema/auth/user-display';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  FormField,
  Input,
  Skeleton,
} from '@noema/ui';
import { Edit2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { toast } from '@/hooks/use-toast';
import { CountrySelector } from '@/components/country-selector';
import { getSortedTimezones } from '@/lib/timezone-data';

// ============================================================================
// Schema
// ============================================================================

const profileSchema = z.object({
  displayName: z
    .string()
    .min(2, 'Display name must be at least 2 characters')
    .max(100, 'Display name must be at most 100 characters'),
  bio: z.string().max(500, 'Bio must be at most 500 characters').optional().or(z.literal('')),
  timezone: z.string().optional(),
  language: z.string().optional(),
  country: z
    .string()
    .length(2, 'Country code must be 2 letters')
    .regex(/^[A-Z]{2}$/, 'Must be a 2-letter uppercase country code')
    .optional()
    .or(z.literal('')),
});

type ProfileFormData = z.infer<typeof profileSchema>;

// ============================================================================
// Constants
// ============================================================================

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'el', label: 'Ελληνικά' },
  { value: 'ru', label: 'Русский' },
  { value: 'ar', label: 'العربية' },
  { value: 'zh', label: '中文' },
  { value: 'pt', label: 'Português' },
] as const;

// ============================================================================
// Module-level constants (computed once, not per render)
// ============================================================================

const SORTED_TIMEZONES = getSortedTimezones();

// ============================================================================
// Component
// ============================================================================

export default function ProfilePage(): React.JSX.Element {
  const { user: authUser } = useAuth();
  const { data: user, isLoading } = useMe();
  const updateProfile = useUpdateProfile();
  const [isEditing, setIsEditing] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: '',
      bio: '',
      timezone: '',
      language: 'en',
      country: '',
    },
  });

  // Populate form when user data loads. Guard on !isEditing so a background
  // refetch or mutation-triggered cache update does not silently discard edits.
  useEffect(() => {
    if (user !== undefined && !isEditing) {
      reset({
        displayName: user.displayName,
        bio: user.bio ?? '',
        timezone: user.timezone,
        language: user.language,
        country: user.country ?? '',
      });
    }
  }, [user, isEditing, reset]);

  const handleCancelEdit = (): void => {
    if (user !== undefined) {
      reset({
        displayName: user.displayName,
        bio: user.bio ?? '',
        timezone: user.timezone,
        language: user.language,
        country: user.country ?? '',
      });
    }
    setIsEditing(false);
  };

  const onSubmit = async (data: ProfileFormData): Promise<void> => {
    // user is guaranteed defined here — Save is disabled while user is undefined
    if (user === undefined) return;
    const version = user.version;
    try {
      await updateProfile.mutateAsync({
        data: {
          displayName: data.displayName,
          bio: data.bio !== '' ? (data.bio ?? null) : null,
          ...(data.timezone !== '' && data.timezone !== undefined
            ? { timezone: data.timezone }
            : {}),
          ...(data.language !== '' && data.language !== undefined
            ? { language: data.language }
            : {}),
          country: data.country !== '' ? (data.country ?? null) : null,
        },
        version,
      });
      toast.success('Profile updated successfully.');
      setIsEditing(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Update failed';
      if (message.toLowerCase().includes('version') || message.toLowerCase().includes('conflict')) {
        toast.error('Profile was updated elsewhere. Please refresh the page and try again.');
      } else {
        toast.error(message);
      }
    }
  };

  // Use the fresh API data; fall back to auth store while loading
  const displayUser = user ?? authUser;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Profile</h1>
          <p className="text-muted-foreground mt-1">Manage your public profile information.</p>
        </div>
        {!isEditing && (
          <Button
            variant="outline"
            disabled={isLoading}
            onClick={() => {
              setIsEditing(true);
            }}
          >
            <Edit2 className="mr-2 h-4 w-4" />
            Edit Profile
          </Button>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Avatar card */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Avatar</CardTitle>
            <CardDescription>Your profile picture</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            {isLoading ? (
              <Skeleton variant="circle" className="h-24 w-24" />
            ) : (
              <Avatar className="h-24 w-24">
                <AvatarImage src={displayUser?.avatarUrl ?? undefined} />
                <AvatarFallback className="text-2xl">{getUserInitials(displayUser)}</AvatarFallback>
              </Avatar>
            )}
            <Button variant="outline" disabled>
              Change avatar
            </Button>
            <p className="text-xs text-muted-foreground text-center">Avatar upload coming soon</p>
          </CardContent>
        </Card>

        {/* Profile info card */}
        <Card className="md:col-span-2">
          {isEditing ? (
            <form onSubmit={(e) => void handleSubmit(onSubmit)(e)}>
              <CardHeader>
                <CardTitle>Edit Profile</CardTitle>
                <CardDescription>Update your profile details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField label="Email" description="Email cannot be changed">
                  <Input value={displayUser?.email ?? ''} disabled />
                </FormField>

                <FormField label="Display Name" error={errors.displayName?.message} required>
                  <Input placeholder="Your display name" {...register('displayName')} />
                </FormField>

                <FormField
                  label="Bio"
                  error={errors.bio?.message}
                  description="A short description about yourself (max 500 characters)"
                >
                  <textarea
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="Tell us about yourself"
                    {...register('bio')}
                  />
                </FormField>

                <FormField label="Language" error={errors.language?.message}>
                  <select
                    {...register('language')}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {LANGUAGES.map((lang) => (
                      <option key={lang.value} value={lang.value}>
                        {lang.label}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Timezone" error={errors.timezone?.message}>
                  <select
                    {...register('timezone')}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="">Select timezone...</option>
                    {SORTED_TIMEZONES.map((tz) => (
                      <option key={tz.timezone} value={tz.timezone}>
                        {tz.label} ({tz.utcOffset})
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Country" error={errors.country?.message}>
                  <Controller
                    name="country"
                    control={control}
                    render={({ field }) => (
                      <CountrySelector
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        error={!!errors.country}
                      />
                    )}
                  />
                </FormField>
              </CardContent>
              <CardFooter className="flex gap-2">
                <Button type="submit" disabled={isSubmitting || !isDirty || user === undefined}>
                  {isSubmitting ? 'Saving...' : 'Save changes'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancelEdit}
                  disabled={isSubmitting}
                >
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
              </CardFooter>
            </form>
          ) : (
            <>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
                <CardDescription>Your profile as others see it</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoading ? (
                  <div className="space-y-3">
                    <Skeleton variant="text" className="w-3/4" />
                    <Skeleton variant="text" className="w-1/2" />
                    <Skeleton variant="text" className="w-2/3" />
                  </div>
                ) : (
                  <dl className="space-y-3 text-sm">
                    <div className="grid grid-cols-3 gap-2">
                      <dt className="font-medium text-muted-foreground">Email</dt>
                      <dd className="col-span-2">{displayUser?.email ?? '—'}</dd>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <dt className="font-medium text-muted-foreground">Username</dt>
                      <dd className="col-span-2">@{displayUser?.username ?? '—'}</dd>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <dt className="font-medium text-muted-foreground">Display name</dt>
                      <dd className="col-span-2">{displayUser?.displayName ?? '—'}</dd>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <dt className="font-medium text-muted-foreground">Bio</dt>
                      <dd className="col-span-2 text-muted-foreground">
                        {user?.bio ?? <span className="italic">No bio yet</span>}
                      </dd>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <dt className="font-medium text-muted-foreground">Language</dt>
                      <dd className="col-span-2">{user?.language ?? '—'}</dd>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <dt className="font-medium text-muted-foreground">Timezone</dt>
                      <dd className="col-span-2">{user?.timezone ?? '—'}</dd>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <dt className="font-medium text-muted-foreground">Country</dt>
                      <dd className="col-span-2">{user?.country ?? '—'}</dd>
                    </div>
                    {user?.createdAt !== undefined && (
                      <div className="grid grid-cols-3 gap-2">
                        <dt className="font-medium text-muted-foreground">Member since</dt>
                        <dd className="col-span-2">
                          {new Date(user.createdAt).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </dd>
                      </div>
                    )}
                  </dl>
                )}
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
