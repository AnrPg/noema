/**
 * Register Page — Multi-step Registration Wizard
 *
 * Three-step form covering all ICreateUserInput fields:
 *   Step 1: Account  — email, username, password, confirmPassword
 *   Step 2: Profile  — displayName, language
 *   Step 3: Location — timezone (interactive map + dropdown), country
 */

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@noema/auth';
import {
  Alert,
  AlertDescription,
  AuthHeader,
  AuthLayout,
  Button,
  Card,
  CardContent,
  CardFooter,
  FormField,
  Input,
  PasswordInput,
} from '@noema/ui';
import { AlertCircle, ArrowLeft, ArrowRight, Check, Globe, MapPin, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { CountrySelector } from '../../../components/country-selector';
import { PasswordStrength } from '../../../components/password-strength';
import { TimezoneMap } from '../../../components/timezone-map';
import { getSortedTimezones } from '../../../lib/timezone-data';

// ============================================================================
// Schema — matches server's CreateUserInputSchema + PasswordSchema
// ============================================================================

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'zh', label: '中文' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'pt', label: 'Português' },
  { value: 'el', label: 'Ελληνικά' },
  { value: 'ar', label: 'العربية' },
  { value: 'hi', label: 'हिन्दी' },
  { value: 'ru', label: 'Русский' },
  { value: 'ch', label: 'Schweizerdeutsch' },
] as const;

const registerSchema = z
  .object({
    // Step 1: Account
    email: z.string().email('Invalid email address'),
    username: z
      .string()
      .min(3, 'Username must be at least 3 characters')
      .max(30, 'Username must be at most 30 characters')
      .regex(
        /^[a-zA-Z][a-zA-Z0-9_]*$/,
        'Must start with a letter; only letters, numbers, and underscores'
      ),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password must be at most 128 characters')
      .regex(/[a-z]/, 'Must contain a lowercase letter')
      .regex(/[A-Z]/, 'Must contain an uppercase letter')
      .regex(/[0-9]/, 'Must contain a number')
      .regex(/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/, 'Must contain a special character'),
    confirmPassword: z.string(),

    // Step 2: Profile
    displayName: z.string().max(100).optional().or(z.literal('')),
    language: z.string().optional(),

    // Step 3: Location
    timezone: z.string().optional(),
    country: z
      .string()
      .regex(/^([A-Z]{2})?$/, 'Must be a 2-letter uppercase country code')
      .optional()
      .or(z.literal('')),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

// ============================================================================
// Step definitions
// ============================================================================

const STEPS = [
  {
    id: 'account',
    label: 'Account',
    icon: User,
    fields: ['email', 'username', 'password', 'confirmPassword'] as const,
  },
  { id: 'profile', label: 'Profile', icon: Globe, fields: ['displayName', 'language'] as const },
  { id: 'location', label: 'Location', icon: MapPin, fields: ['timezone', 'country'] as const },
] as const;

// ============================================================================
// Component
// ============================================================================

export default function RegisterPage(): React.JSX.Element {
  const router = useRouter();
  const { register: registerUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);

  const {
    register,
    handleSubmit,
    control,
    trigger,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      username: '',
      password: '',
      confirmPassword: '',
      displayName: '',
      language: 'en',
      timezone:
        typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC',
      country: '',
    },
    mode: 'onTouched',
  });

  const password = watch('password');
  const email = watch('email');

  // Auto-suggest username from email when user tabs out of email field
  const handleEmailBlur = useCallback(() => {
    const currentUsername = watch('username');
    if (currentUsername === '' && email !== '') {
      const suggested = email
        .split('@')[0]
        ?.replace(/[^a-zA-Z0-9_]/g, '')
        .toLowerCase();
      if (
        suggested !== undefined &&
        suggested !== '' &&
        suggested.length >= 3 &&
        /^[a-zA-Z]/.test(suggested)
      ) {
        setValue('username', suggested.slice(0, 30));
        void trigger('username');
      }
    }
  }, [email, watch, setValue, trigger]);

  /** Validate current step fields before advancing */
  const handleNext = useCallback(async () => {
    const step = STEPS[currentStep];
    if (!step) return;
    const valid = await trigger([...step.fields] as (keyof RegisterFormData)[]);
    if (valid) {
      setCurrentStep((s) => Math.min(s + 1, STEPS.length - 1));
    }
  }, [currentStep, trigger]);

  const handleBack = useCallback(() => {
    setCurrentStep((s) => Math.max(s - 1, 0));
  }, []);

  const onSubmit = async (data: RegisterFormData): Promise<void> => {
    try {
      setError(null);
      await registerUser({
        username: data.username.toLowerCase(),
        email: data.email,
        password: data.password,
        ...(data.displayName !== undefined &&
          data.displayName !== '' && { displayName: data.displayName }),
        ...(data.language !== undefined && data.language !== '' && { language: data.language }),
        ...(data.timezone !== undefined && data.timezone !== '' && { timezone: data.timezone }),
        ...(data.country !== undefined && data.country !== '' && { country: data.country }),
      });
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
      // Go back to account step where most server errors occur
      setCurrentStep(0);
    }
  };

  const isLastStep = currentStep === STEPS.length - 1;
  const sortedTimezones = getSortedTimezones();

  return (
    <AuthLayout className="py-8">
      <AuthHeader
        title="Create an account"
        description="Start your personalized learning journey"
      />

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2 mb-2">
        {STEPS.map((step, index) => {
          const StepIcon = step.icon;
          const isActive = index === currentStep;
          const isCompleted = index < currentStep;

          return (
            <div key={step.id} className="flex items-center">
              {index > 0 && (
                <div
                  className={`h-px w-8 mx-1 transition-colors duration-300 ${
                    isCompleted ? 'bg-primary' : 'bg-border'
                  }`}
                />
              )}
              <button
                type="button"
                onClick={() => {
                  if (isCompleted) setCurrentStep(index);
                }}
                disabled={!isCompleted && !isActive}
                className={`
                  flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium
                  transition-all duration-300
                  ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : isCompleted
                        ? 'bg-primary/10 text-primary cursor-pointer hover:bg-primary/20'
                        : 'bg-muted text-muted-foreground'
                  }
                `}
              >
                {isCompleted ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <StepIcon className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">{step.label}</span>
              </button>
            </div>
          );
        })}
      </div>

      <Card>
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)}>
          <CardContent className="space-y-4 pt-6">
            {error !== null && error !== '' && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* ============== Step 1: Account ============== */}
            {currentStep === 0 && (
              <div className="space-y-4 animate-in fade-in-0 slide-in-from-right-4 duration-300">
                <FormField label="Email" error={errors.email?.message} required>
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    {...register('email', { onBlur: handleEmailBlur })}
                  />
                </FormField>

                <FormField
                  label="Username"
                  error={errors.username?.message}
                  description="3-30 characters, starts with a letter, alphanumeric and underscores"
                  required
                >
                  <Input placeholder="john_doe" autoComplete="username" {...register('username')} />
                </FormField>

                <FormField label="Password" error={errors.password?.message} required>
                  <PasswordInput
                    placeholder="••••••••"
                    autoComplete="new-password"
                    {...register('password')}
                  />
                  <PasswordStrength password={password} />
                </FormField>

                <FormField
                  label="Confirm password"
                  error={errors.confirmPassword?.message}
                  required
                >
                  <PasswordInput
                    placeholder="••••••••"
                    autoComplete="new-password"
                    {...register('confirmPassword')}
                  />
                </FormField>
              </div>
            )}

            {/* ============== Step 2: Profile ============== */}
            {currentStep === 1 && (
              <div className="space-y-4 animate-in fade-in-0 slide-in-from-right-4 duration-300">
                <FormField
                  label="Display name"
                  error={errors.displayName?.message}
                  description="How others will see you"
                >
                  <Input placeholder="John Doe" autoComplete="name" {...register('displayName')} />
                </FormField>

                <FormField
                  label="Preferred language"
                  error={errors.language?.message}
                  description="Language for the user interface"
                >
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
              </div>
            )}

            {/* ============== Step 3: Location ============== */}
            {currentStep === 2 && (
              <div className="space-y-4 animate-in fade-in-0 slide-in-from-right-4 duration-300">
                <FormField
                  label="Timezone"
                  error={errors.timezone?.message}
                  description="Select from the map or the dropdown below"
                >
                  <Controller
                    name="timezone"
                    control={control}
                    render={({ field }) => (
                      <div className="space-y-3">
                        <TimezoneMap value={field.value ?? ''} onChange={field.onChange} />
                        <select
                          value={field.value ?? ''}
                          onChange={(e) => {
                            field.onChange(e.target.value);
                          }}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          <option value="" disabled>
                            Select timezone...
                          </option>
                          {sortedTimezones.map((tz) => (
                            <option key={tz.timezone} value={tz.timezone}>
                              {tz.label} ({tz.utcOffset})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  />
                </FormField>

                <FormField
                  label="Country"
                  error={errors.country?.message}
                  description="Used for content localization"
                >
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
              </div>
            )}
          </CardContent>

          <CardFooter className="flex-col gap-4">
            {/* Navigation buttons */}
            <div className="flex w-full gap-3">
              {currentStep > 0 && (
                <Button type="button" variant="outline" onClick={handleBack} className="flex-1">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              )}

              {isLastStep ? (
                <Button type="submit" className="flex-1" disabled={isSubmitting}>
                  {isSubmitting ? 'Creating account...' : 'Create account'}
                </Button>
              ) : (
                <Button type="button" onClick={() => void handleNext()} className="flex-1">
                  Next
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>

            {/* Skip optional steps link */}
            {currentStep > 0 && !isLastStep && (
              <button
                type="button"
                onClick={() => {
                  setCurrentStep((s) => s + 1);
                }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Skip this step
              </button>
            )}

            <p className="text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link href="/login" className="text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </AuthLayout>
  );
}
